import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updatePassword
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { dbGet, dbSet, dbUpdate, dbQuery } from '../services/db/index.js';
import { safeDocumentHref } from '../utils/security';
import {
    getOrgRegistry,
    hideOrgInRegistry,
    unhideOrgInRegistry,
    applyOrgDbConfig,
    isCurrentDb,
    getDbTypeLabel,
} from '../utils/orgRegistry.js';

const VENDOR_SESSION_KEY = 'vendorSession';
/** sessionStorage key used to survive the DB-switch page reload */
const VENDOR_PICKED_ORG_KEY = 'vendor_portal_picked_org';

// NOTE: The vendor portal used to create a SECONDARY Firebase app named
// 'vendor-portal-app' and sign in against it. That broke RTDB reads
// because dbGet uses the PRIMARY app's database connection, which has
// no auth.currentUser when sign-in happens on a secondary instance.
// We now sign in directly on the primary `auth` instance, mirroring the
// fix applied to the field portal (commit edc8ef9).

const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

const safeArrWithKeys = (dataObj) => {
    if (!dataObj) return [];
    if (Array.isArray(dataObj)) return dataObj.filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) }));
    return Object.entries(dataObj).map(([k, v]) => ({ ...v, firebaseKey: k }));
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeVendorCode = (value) => String(value || '').trim().toUpperCase();
const isPermissionDeniedError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    return message.includes('permission_denied') || message.includes('permission denied') || code.includes('permission_denied');
};
const buildVendorAuthErrorMessage = (error) => {
    const code = error?.code || '';

    if (code === 'auth/operation-not-allowed') {
        return 'Firebase Email/Password sign-in is disabled for this project. In Firebase Console, enable Authentication > Sign-in method > Email/Password.';
    }

    if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
    ) {
        return 'The portal email or password is incorrect. If this vendor account was newly provisioned, use the issued temporary password first. Otherwise ask your client admin to reset or reprovision the portal access.';
    }

    if (code === 'auth/invalid-email') {
        return 'Please enter a valid portal email address.';
    }

    return 'Could not sign in: ' + (error?.message || 'Unknown error.');
};

const readVendorSession = () => {
    try {
        const raw = sessionStorage.getItem(VENDOR_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const createWorkerForm = (worker = {}) => ({
    id: worker.id || '',
    name: worker.name || '',
    role: worker.role || 'Worker',
    competence: worker.competence || '',
    deployedSite: worker.deployedSite || '',
    employeeId: worker.employeeId || '',
    phone: worker.phone || ''
});

const buildVendorState = (firebaseKey, vendorData) => ({
    ...vendorData,
    firebaseKey,
    allocatedSites: safeArr(vendorData.allocatedSites),
    documents: safeArr(vendorData.documents),
    workers: safeArr(vendorData.workers).map(w => ({ ...w, additionalDocs: safeArr(w.additionalDocs) }))
});

const readVendorSiteCollection = async ({ orgId, childName, orgUser }) => {
    if (orgUser?.assignedSite === 'GLOBAL') {
        const snap = await dbGet(`organizations/${orgId}/${childName}`);
        return snap !== null ? snap : {};
    }

    const siteIds = [orgUser?.assignedSite].filter(Boolean);
    if (siteIds.length === 0) return {};
    const entries = await Promise.all(siteIds.map(async (siteId) => {
        const snap = await dbQuery(`organizations/${orgId}/${childName}`, 'siteId', siteId);
        return snap !== null ? snap : {};
    }));

    return entries.reduce((acc, entry) => ({ ...acc, ...entry }), {});
};

const readOptionalPasswordState = async ({ orgId, uid }) => {
    try {
        const snap = await dbGet(`organizations/${orgId}/userPasswordState/${uid}`);
        return snap !== null ? snap : null;
    } catch (error) {
        if (isPermissionDeniedError(error)) {
            console.warn('Vendor password-state read blocked; falling back to user profile flags.', error);
            return null;
        }
        throw error;
    }
};

const resolveLinkedContractor = async ({
    cleanEmail,
    cleanVendorCode,
    expectedContractorId,
    orgId,
    orgUser,
    user
}) => {
    const preferredContractorId = expectedContractorId || orgUser?.portalLinkedContractorId || '';
    // Diagnostic log so the admin can see in the console exactly what link
    // the portal is following.  Helps when a vendor with provisioning gaps
    // hits "not linked to any contractor profile" — the next two lines
    // tell you whether the portal-user record had a link, what the URL
    // expected, and whose email/code combination the portal is trying.
    // eslint-disable-next-line no-console
    console.log('[vendor-portal] resolveLinkedContractor →', {
        preferredContractorId,
        orgUserPortalLinkedContractorId: orgUser?.portalLinkedContractorId || '(missing)',
        expectedContractorId: expectedContractorId || '(none from URL)',
        userUid: user.uid,
        cleanEmail,
        cleanVendorCode: cleanVendorCode || '(no code from URL)'
    });

    if (preferredContractorId) {
        try {
            const directSnap = await dbGet(`organizations/${orgId}/contractors/${preferredContractorId}`);
            if (directSnap !== null) {
                // eslint-disable-next-line no-console
                console.log('[vendor-portal] direct contractor read OK:', { preferredContractorId, email: directSnap?.email, portalUid: directSnap?.portalUid });
                return [preferredContractorId, directSnap];
            }
            // eslint-disable-next-line no-console
            console.warn('[vendor-portal] direct contractor read returned null — falling back to collection scan');
        } catch (error) {
            if (!isPermissionDeniedError(error)) {
                throw error;
            }
            // eslint-disable-next-line no-console
            console.warn('[vendor-portal] direct linked contractor read blocked by rules, falling back to collection scan.', error);
        }
    }

    const contractorSnap = await dbGet(`organizations/${orgId}/contractors`);
    if (contractorSnap === null) {
        throw new Error('No contractor records were found for this organization.');
    }

    const contractorKeys = Object.keys(contractorSnap);
    // eslint-disable-next-line no-console
    console.log('[vendor-portal] contractor collection keys:', contractorKeys);

    const matchedEntry = Object.entries(contractorSnap).find(([contractorKey, contractor]) => {
        const contractorEmail = normalizeEmail(contractor?.email);
        const contractorCode = normalizeVendorCode(contractor?.vendorCode);
        const contractorPortalUid = contractor?.portalUid || '';
        if (expectedContractorId && contractorKey === expectedContractorId) return true;
        if (orgUser?.portalLinkedContractorId && orgUser.portalLinkedContractorId === contractorKey) return true;
        if (contractorPortalUid === user.uid) return true;
        if (cleanVendorCode && contractorCode === cleanVendorCode && contractorEmail === cleanEmail) return true;
        return contractorEmail === cleanEmail;
    });

    if (!matchedEntry) {
        // eslint-disable-next-line no-console
        console.error('[vendor-portal] no contractor matched any criterion. Dump:',
            Object.entries(contractorSnap).map(([k, v]) => ({
                key: k,
                email: normalizeEmail(v?.email),
                vendorCode: normalizeVendorCode(v?.vendorCode),
                portalUid: v?.portalUid || ''
            }))
        );
        throw new Error(
            'The signed-in account is not linked to any contractor profile. ' +
            'Ask your client admin to (1) re-open the contractor profile, ' +
            '(2) click Provision & Email Login again, and (3) check the browser console ' +
            'on this page — the contractor list dump there shows what the portal can see.'
        );
    }

    // eslint-disable-next-line no-console
    console.log('[vendor-portal] matched contractor via collection scan:', matchedEntry[0]);
    return matchedEntry;
};

const buildVendorUpdateAuditPayload = (currentUser) => ({
    portalLastVendorUpdateAt: new Date().toISOString(),
    portalLastVendorUpdateBy: currentUser?.uid || '',
    portalLastVendorUpdateEmail: normalizeEmail(currentUser?.email || '')
});

export default function VendorPortal() {
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [activeTab, setActiveTab] = useState('documentation');
    const [vendorSession, setVendorSession] = useState(null);
    const [vendor, setVendor] = useState(null);
    const [vendorIncidents, setVendorIncidents] = useState([]);
    const [vendorPermits, setVendorPermits] = useState([]);
    const [uploadingId, setUploadingId] = useState(null);
    const [workerForm, setWorkerForm] = useState(createWorkerForm());
    const [savingWorker, setSavingWorker] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
    const [isPasswordSaving, setIsPasswordSaving] = useState(false);
    const manualLoginRef = useRef(false);

    // ── Database / org selection (Step 1 before login) ────────────────────────
    // Mirrors the field portal: the vendor must pick which organisation's
    // database to connect to BEFORE logging in.  Each registry entry has its
    // own Firebase config; picking one writes the config to localStorage and
    // reloads the page so the SDK re-initialises against that project.
    const [orgRegistry, setOrgRegistry] = useState([]);
    const [pickedOrg, setPickedOrg] = useState(null);   // null = show picker
    const [currentOrgId, setCurrentOrgId] = useState(null);
    // When true, the picker also renders entries with `hidden: true` so the
    // vendor can un-hide them. Toggled by the "Show hidden (N)" link.
    const [showHidden, setShowHidden] = useState(false);

    // Load org registry + restore pickedOrg after a DB-switch reload.
    useEffect(() => {
        const registry = getOrgRegistry();
        setOrgRegistry(registry);

        // If a vendor session already exists, remember its orgId so the
        // active indicator in the picker shows the correct entry.
        const existing = readVendorSession();
        if (existing?.orgId) setCurrentOrgId(existing.orgId);

        // After a DB-switch reload the picked org is stashed in sessionStorage.
        const pending = sessionStorage.getItem(VENDOR_PICKED_ORG_KEY);
        if (pending) {
            try { setPickedOrg(JSON.parse(pending)); } catch { /* ignore */ }
            sessionStorage.removeItem(VENDOR_PICKED_ORG_KEY);
        }
    }, []);

    /** User clicked an org card in the DB picker. */
    const handleOrgPick = (entry) => {
        if (isCurrentDb(entry, currentOrgId)) {
            // Already the active database — just advance to the login form.
            setPickedOrg(entry);
        } else {
            // Different database: write config to localStorage and reload
            // so the Firebase SDK re-initialises with the correct credentials.
            applyOrgDbConfig(entry);
            sessionStorage.setItem(VENDOR_PICKED_ORG_KEY, JSON.stringify(entry));
            window.location.reload();
        }
    };

    /** Return from the login form back to the org picker. */
    const handleBackToPicker = () => setPickedOrg(null);

    /**
     * Hide an org card from the picker. The entry stays in the registry
     * with `hidden: true` so it can be restored later via the "Show hidden"
     * toggle — nothing is actually deleted.
     */
    const handleHideOrg = (event, entry) => {
        event.stopPropagation();
        event.preventDefault();
        const next = hideOrgInRegistry(entry.orgId);
        setOrgRegistry(next);
    };

    /** Reverse of handleHideOrg — restore a hidden entry to the picker. */
    const handleUnhideOrg = (event, entry) => {
        event.stopPropagation();
        event.preventDefault();
        const next = unhideOrgInRegistry(entry.orgId);
        setOrgRegistry(next);
    };

    const getBootstrapHints = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            orgId: params.get('orgId') || '',
            contractorId: params.get('contractorId') || '',
            siteId: params.get('siteId') || '',
            bootstrap: params.get('bootstrap') === '1'
        };
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const prefilledEmail = normalizeEmail(params.get('email'));
        if (!prefilledEmail) return;

        setLoginData((prev) => ({
            ...prev,
            email: prefilledEmail
        }));
    }, []);

    const resetPortalState = useCallback((clearForm = false) => {
        setIsAuthenticated(false);
        setVendor(null);
        setVendorIncidents([]);
        setVendorPermits([]);
        setVendorSession(null);
        setActiveTab('documentation');
        setWorkerForm(createWorkerForm());
        setIsPasswordModalOpen(false);
        setPasswordForm({ current: '', next: '', confirm: '' });
        if (clearForm) {
            setLoginData({ email: '', password: '' });
        }
    }, []);

    const ensureVendorBootstrapAccess = useCallback(async ({ user, cleanEmail, expectedOrgId = '', expectedContractorId = '' }) => {
        const hints = getBootstrapHints();
        const orgId = expectedOrgId || hints.orgId;
        const contractorId = expectedContractorId || hints.contractorId;
        const siteId = hints.siteId || '';

        if (!orgId || !contractorId) {
            throw new Error('This vendor login is not linked yet. Open the setup link sent by your admin or ask them to resend it.');
        }

        const nowIso = new Date().toISOString();
        const bootstrapPayload = {
            name: cleanEmail.split('@')[0] || 'Vendor Portal User',
            email: cleanEmail,
            role: 'User',
            status: 'Active',
            assignedSite: siteId,
            accessibleSites: siteId ? [siteId] : [],
            accessibleModules: [],
            vendorPortal: true,
            portalLinkedContractorId: contractorId,
            portalBootstrapPending: false,
            updatedAt: nowIso,
            createdAt: nowIso
        };

        // Vendor portal bootstrap writes go to the ISOLATED vendorPortalUsers
        // collection — never to `users`. This guarantees a vendor whose email
        // collides with an existing employee's email cannot overwrite the
        // employee's role / permissions.
        await dbSet(`organizations/${orgId}/vendorPortalUsers/${user.uid}`, bootstrapPayload);
        await dbSet(`userDirectory/${user.uid}`, { orgId });
        return { orgId, contractorId };
    }, [getBootstrapHints]);

    const fetchVendorData = useCallback(async ({ user, vendorCode = '', expectedOrgId = '', expectedContractorId = '', showAlerts = true }) => {
        setLoading(true);

        try {
            const cleanVendorCode = normalizeVendorCode(vendorCode);
            const cleanEmail = normalizeEmail(user?.email);

            if (!user?.uid || !cleanEmail) {
                throw new Error('No authenticated portal session found. Please sign in again.');
            }

            // BUG (now fixed): the predicate used to be `!userDirSnap !== null`,
            // which parses as `(!userDirSnap) !== null` and is ALWAYS true
            // (both true and false satisfy `!== null`). Result: the bootstrap
            // branch ran for every login — and the post-bootstrap check threw
            // immediately, so every vendor saw 'could not finish linking'
            // even when the directory record existed and the password was
            // correct.  Replaced with the intended "snap is missing → try
            // bootstrap" check.
            let userDirSnap = await dbGet(`userDirectory/${user.uid}`);
            if (userDirSnap === null) {
                await ensureVendorBootstrapAccess({
                    user,
                    cleanEmail,
                    expectedOrgId,
                    expectedContractorId
                });
                userDirSnap = await dbGet(`userDirectory/${user.uid}`);
                if (userDirSnap === null) {
                    throw new Error('This vendor login could not finish linking to the organization. Ask your client admin to resend the setup link.');
                }
            }

            const orgId = userDirSnap.orgId;
            if (expectedOrgId && expectedOrgId !== orgId) {
                throw new Error('This login belongs to a different organization than the saved portal session.');
            }

            // Read vendor record from vendorPortalUsers (the new, isolated
            // collection). Fall back to the legacy users path so vendors
            // provisioned before the refactor still work. Note: if a record
            // exists at BOTH paths (vendor was provisioned both before and
            // after the refactor), the new vendorPortalUsers wins.
            let orgUserSnap = await dbGet(`organizations/${orgId}/vendorPortalUsers/${user.uid}`);
            if (!orgUserSnap) {
                orgUserSnap = await dbGet(`organizations/${orgId}/users/${user.uid}`);
            }
            if (!orgUserSnap) {
                await ensureVendorBootstrapAccess({
                    user,
                    cleanEmail,
                    expectedOrgId: orgId,
                    expectedContractorId
                });
                // Re-read after bootstrap (which writes to vendorPortalUsers).
                orgUserSnap = await dbGet(`organizations/${orgId}/vendorPortalUsers/${user.uid}`);
                if (!orgUserSnap) {
                    orgUserSnap = await dbGet(`organizations/${orgId}/users/${user.uid}`);
                }
                if (!orgUserSnap) {
                    throw new Error('Your authenticated account is missing from the organization directory.');
                }
            }

            const orgUser = orgUserSnap;
            // eslint-disable-next-line no-console
            console.log('[vendor-portal] orgUser loaded:', {
                source: 'vendorPortalUsers fallback users',
                status: orgUser.status,
                vendorPortal: orgUser.vendorPortal,
                portalLinkedContractorId: orgUser.portalLinkedContractorId || '(missing)',
                role: orgUser.role,
                assignedSite: orgUser.assignedSite
            });
            const passwordState = await readOptionalPasswordState({ orgId, uid: user.uid });
            if (orgUser.status === 'Pending') {
                throw new Error('Your portal account is still pending approval. Ask your client admin to activate it.');
            }
            if (orgUser.status === 'Deleted' || orgUser.status === 'Inactive') {
                throw new Error('This portal account has been deactivated.');
            }
            if (!orgUser.vendorPortal || !String(orgUser.portalLinkedContractorId || '').trim()) {
                throw new Error('This login is active in the organization, but vendor portal access has not been linked yet. Ask your client admin to provision contractor portal access for this account.');
            }

            let matchedEntry;
            try {
                matchedEntry = await resolveLinkedContractor({
                    cleanEmail,
                    cleanVendorCode,
                    expectedContractorId,
                    orgId,
                    orgUser,
                    user
                });
            } catch (error) {
                if (isPermissionDeniedError(error)) {
                    throw new Error('Vendor login succeeded, but contractor records are still blocked by database rules. Please deploy the latest database rules and try again.');
                }
                throw error;
            }

            const [firebaseKey, vendorData] = matchedEntry;
            const normalizedVendor = buildVendorState(firebaseKey, vendorData);
            const resolvedVendorCode = normalizeVendorCode(vendorData.vendorCode || cleanVendorCode);

            // CRITICAL PERFORMANCE NOTE — incidents + ptwRecords used to be
            // awaited INLINE here, but vendors in vendorPortalUsers have no
            // valid path through those collections' read rules. Firebase's
            // permission-denied response can take the full 15s read-timeout
            // to surface — so the login was hanging for up to 30 seconds
            // before the password-change modal could fire (and most users
            // would close the tab thinking it was broken). Fire-and-forget
            // them in the background so the login completes immediately;
            // they'll populate the relevant tabs whenever they resolve.
            let matchedIncidents = [];
            let matchedPermits = [];
            const backgroundFetchIncidents = readVendorSiteCollection({ orgId, childName: 'incidents', orgUser })
                .then((incidentData) => {
                    const list = safeArrWithKeys(incidentData)
                        .filter(i => i.contractorId === firebaseKey || (i.contractorName && i.contractorName.toLowerCase() === (vendorData.companyName || '').toLowerCase()))
                        .sort((a, b) => new Date(b.incidentDate || b.date || 0) - new Date(a.incidentDate || a.date || 0));
                    setVendorIncidents(list);
                })
                .catch((error) => {
                    console.warn('Incident fetch blocked or unavailable.', error);
                });
            const backgroundFetchPermits = readVendorSiteCollection({ orgId, childName: 'ptwRecords', orgUser })
                .then((permitData) => {
                    const list = safeArrWithKeys(permitData)
                        .filter(p => p.contractorId === firebaseKey || (p.contractorName && p.contractorName.toLowerCase() === (vendorData.companyName || '').toLowerCase()))
                        .sort((a, b) => new Date(b.createdAt || b.validFromDate || 0) - new Date(a.createdAt || a.validFromDate || 0));
                    setVendorPermits(list);
                })
                .catch((error) => {
                    console.warn('PTW fetch blocked or unavailable.', error);
                });
            // Reference them so the linter doesn't strip the promises.
            void backgroundFetchIncidents;
            void backgroundFetchPermits;

            const nextSession = {
                email: cleanEmail,
                orgId,
                vendorCode: resolvedVendorCode,
                contractorId: firebaseKey,
                mustChangePassword: passwordState ? Boolean(passwordState.mustChangePassword) : Boolean(orgUser.mustChangePassword)
            };

            setVendor(normalizedVendor);
            setVendorIncidents(matchedIncidents);
            setVendorPermits(matchedPermits);
            setVendorSession(nextSession);
            setIsAuthenticated(true);
            setLoginData({
                email: cleanEmail,
                password: ''
            });
            sessionStorage.setItem(VENDOR_SESSION_KEY, JSON.stringify(nextSession));

            if (showAlerts) {
                alert('Login successful.');
            }
        } catch (error) {
            console.error('Vendor portal login error:', error);
            sessionStorage.removeItem(VENDOR_SESSION_KEY);
            resetPortalState(false);
            await signOut(auth).catch(() => {});
            if (showAlerts) {
                alert(error.message || 'Failed to connect to the portal.');
            }
        } finally {
            setLoading(false);
        }
    }, [ensureVendorBootstrapAccess, resetPortalState]);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe = () => {};

        const init = async () => {
            // NOTE: `auth` is the PRIMARY Firebase auth instance — we used
            // to also call setPersistence(auth, browserSessionPersistence)
            // here, but that downgraded the main-app session to clear on
            // every browser restart whenever someone opened the vendor
            // portal in the same browser.  Keeping the primary auth's
            // default browserLocalPersistence is the correct behavior.

            unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (cancelled || manualLoginRef.current) return;

                const storedSession = readVendorSession();

                if (!user) {
                    sessionStorage.removeItem(VENDOR_SESSION_KEY);
                    resetPortalState(false);
                    setLoading(false);
                    return;
                }

                if (normalizeEmail(storedSession?.email) === normalizeEmail(user.email)) {
                    await fetchVendorData({
                        user,
                        vendorCode: storedSession?.vendorCode || '',
                        expectedOrgId: storedSession.orgId,
                        expectedContractorId: storedSession.contractorId,
                        showAlerts: false
                    });
                    return;
                }

                await fetchVendorData({
                    user,
                    vendorCode: storedSession?.vendorCode || '',
                    expectedOrgId: storedSession?.orgId || '',
                    expectedContractorId: storedSession?.contractorId || '',
                    showAlerts: false
                });
            });

            if (cancelled) {
                unsubscribe();
            }
        };

        init();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [fetchVendorData, resetPortalState]);

    const handleLogin = async (e) => {
        e.preventDefault();

        const cleanEmail = normalizeEmail(loginData.email);
        const cleanPassword = String(loginData.password || '');

        if (!cleanEmail || !cleanPassword) {
            alert('Please enter your email and password.');
            return;
        }

        setLoading(true);

        try {
            manualLoginRef.current = true;
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            await fetchVendorData({
                user: userCredential.user,
                showAlerts: true
            });
        } catch (error) {
            console.error('Vendor sign-in failed:', error);
            alert(buildVendorAuthErrorMessage(error));
        } finally {
            manualLoginRef.current = false;
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        const cleanEmail = normalizeEmail(loginData.email);
        if (!cleanEmail) {
            alert('Please enter your portal email first.');
            return;
        }

        const hints = getBootstrapHints();

        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, cleanEmail, {
                url: `${window.location.origin}/vendor-portal?email=${encodeURIComponent(cleanEmail)}${hints.orgId ? `&orgId=${encodeURIComponent(hints.orgId)}` : ''}${hints.contractorId ? `&contractorId=${encodeURIComponent(hints.contractorId)}` : ''}${hints.siteId ? `&siteId=${encodeURIComponent(hints.siteId)}` : ''}${hints.bootstrap ? '&bootstrap=1' : ''}`,
                handleCodeInApp: false
            });
            alert('If the vendor portal account exists for this email, a password reset link has been sent.');
        } catch (error) {
            if (error?.code === 'auth/invalid-email') {
                alert('Please enter a valid portal email address.');
            } else {
                alert('If the vendor portal account exists for this email, a password reset link has been sent.');
            }
        } finally {
            setLoading(false);
        }
    };

    const closePasswordModal = () => {
        if (vendorSession?.mustChangePassword || isPasswordSaving) return;
        setIsPasswordModalOpen(false);
        setPasswordForm({ current: '', next: '', confirm: '' });
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();

        const currentUser = auth.currentUser;
        const userEmail = currentUser?.email || vendorSession?.email;
        const wasForcedPasswordChange = Boolean(vendorSession?.mustChangePassword);

        if (!currentUser || !userEmail || !vendorSession?.orgId) {
            alert('Your vendor portal session is not ready. Please sign in again.');
            return;
        }

        if (passwordForm.next.length < 8) {
            alert('New password must be at least 8 characters.');
            return;
        }

        if (passwordForm.next !== passwordForm.confirm) {
            alert('New password and confirmation do not match.');
            return;
        }

        if (passwordForm.current === passwordForm.next) {
            alert('New password must be different from the current password.');
            return;
        }

        setIsPasswordSaving(true);
        try {
            const credential = EmailAuthProvider.credential(userEmail, passwordForm.current);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, passwordForm.next);
            const passwordUpdatedAt = new Date().toISOString();
            await dbUpdate(`organizations/${vendorSession.orgId}/userPasswordState/${currentUser.uid}`, {
                mustChangePassword: false,
                temporaryPasswordIssued: false,
                temporaryPasswordIssuedAt: '',
                passwordUpdatedAt
            });

            if (wasForcedPasswordChange) {
                sessionStorage.removeItem(VENDOR_SESSION_KEY);
                await signOut(auth).catch(() => {});
                resetPortalState(false);
                setLoginData({ email: userEmail, password: '' });
                alert('Password changed successfully. Please sign in again with your new password.');
                return;
            }

            const nextSession = {
                ...(vendorSession || {}),
                mustChangePassword: false,
                temporaryPasswordIssued: false,
                temporaryPasswordIssuedAt: '',
                passwordUpdatedAt
            };
            setVendorSession(nextSession);
            sessionStorage.setItem(VENDOR_SESSION_KEY, JSON.stringify(nextSession));
            setIsPasswordModalOpen(false);
            setPasswordForm({ current: '', next: '', confirm: '' });
            alert('Password changed successfully.');
        } catch (error) {
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                alert('Current password is incorrect. Please try again.');
            } else if (error.code === 'auth/weak-password') {
                alert('New password is too weak. Use a stronger password.');
            } else if (error.code === 'auth/requires-recent-login') {
                alert('Please sign in again before changing your password.');
            } else {
                alert(`Password change failed: ${error.message}`);
            }
        } finally {
            setIsPasswordSaving(false);
        }
    };

    useEffect(() => {
        if (vendorSession?.mustChangePassword) {
            setIsPasswordModalOpen(true);
        }
    }, [vendorSession?.mustChangePassword]);

    const handleLogout = async () => {
        sessionStorage.removeItem(VENDOR_SESSION_KEY);
        resetPortalState(true);
        setLoading(false);
        await signOut(auth).catch(() => {});
    };

    const getComplianceStatus = (docsData) => {
        const docs = safeArr(docsData);
        if (docs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct: 0 };

        const requiredDocs = docs.filter(d => d.isMandatory || d.status === 'Requested');
        const uploadedDocs = requiredDocs.filter(d => d.status === 'Uploaded' || d.status === 'Verified' || d.file);
        const pct = requiredDocs.length === 0 ? 100 : Math.round((uploadedDocs.length / requiredDocs.length) * 100);

        if (requiredDocs.length === 0) return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
        if (uploadedDocs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct };
        if (uploadedDocs.length < requiredDocs.length) return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        const hasExpired = uploadedDocs.some(d => d.expiryDate && new Date(d.expiryDate) < new Date());
        if (hasExpired) return { label: 'Partially Complied (Expired)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
    };

    const updateDatabase = async (updates) => {
        if (!vendorSession?.orgId || !vendor?.firebaseKey) {
            alert('Portal session expired. Please sign in again.');
            return false;
        }

        try {
            await dbUpdate(`organizations/${vendorSession.orgId}/contractors/${vendor.firebaseKey}`, {
                ...updates,
                ...buildVendorUpdateAuditPayload(auth.currentUser)
            });
            await fetchVendorData({
                user: auth.currentUser,
                expectedOrgId: vendorSession.orgId,
                expectedContractorId: vendorSession.contractorId,
                showAlerts: false
            });
            return true;
        } catch (error) {
            if (isPermissionDeniedError(error)) {
                alert('Vendor update blocked by database rules. Please deploy the latest vendor portal rules and try again.');
            } else {
                alert('Upload failed: ' + error.message);
            }
            return false;
        }
    };

    const handleCompanyDocUpload = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`comp-${docId}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedDocs = vendor.documents.map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
            await updateDatabase({ documents: updatedDocs });
        } catch {
            alert('Failed to read file.');
        }
        setUploadingId(null);
    };

    const handleWorkerCoreDocUpload = async (workerId, type, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`worker-${workerId}-${type}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedWorkers = vendor.workers.map(w => {
                if (w.id === workerId) {
                    const updatedWorker = { ...w };
                    if (type === 'med') {
                        updatedWorker.medDoc = b64;
                        updatedWorker.medDocName = file.name;
                    }
                    if (type === 'comp') {
                        updatedWorker.compDoc = b64;
                        updatedWorker.compDocName = file.name;
                    }
                    return updatedWorker;
                }
                return w;
            });
            await updateDatabase({ workers: updatedWorkers });
        } catch {
            alert('Failed to process document.');
        }
        setUploadingId(null);
    };

    const handleWorkerAdditionalDocUpload = async (workerId, docId, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`worker-add-${docId}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedWorkers = vendor.workers.map(w => {
                if (w.id === workerId) {
                    const updatedDocs = safeArr(w.additionalDocs).map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
                    return { ...w, additionalDocs: updatedDocs };
                }
                return w;
            });
            await updateDatabase({ workers: updatedWorkers });
        } catch {
            alert('Failed to process document.');
        }
        setUploadingId(null);
    };

    const resetWorkerForm = () => {
        setWorkerForm(createWorkerForm());
    };

    const handleWorkerFormSubmit = async (e) => {
        e.preventDefault();

        const trimmedName = String(workerForm.name || '').trim();
        const trimmedRole = String(workerForm.role || '').trim();
        const trimmedCompetence = String(workerForm.competence || '').trim();
        const trimmedEmployeeId = String(workerForm.employeeId || '').trim();
        const trimmedPhone = String(workerForm.phone || '').trim();

        if (!trimmedName || !trimmedRole || !trimmedCompetence || !workerForm.deployedSite) {
            alert('Please enter employee name, role, competence, and deployed site.');
            return;
        }

        const existingWorker = vendor.workers.find(w => w.id === workerForm.id);
        const nextWorker = {
            ...(existingWorker || {}),
            id: existingWorker?.id || Date.now().toString(),
            name: trimmedName,
            role: trimmedRole,
            competence: trimmedCompetence,
            deployedSite: workerForm.deployedSite,
            employeeId: trimmedEmployeeId,
            phone: trimmedPhone,
            inductionDate: existingWorker?.inductionDate || 'Pending',
            additionalDocs: safeArr(existingWorker?.additionalDocs)
        };

        const updatedWorkers = existingWorker
            ? vendor.workers.map(w => w.id === existingWorker.id ? nextWorker : w)
            : [...vendor.workers, nextWorker];

        setSavingWorker(true);
        const success = await updateDatabase({ workers: updatedWorkers });
        setSavingWorker(false);

        if (success) {
            resetWorkerForm();
            alert(existingWorker ? 'Employee details updated successfully.' : 'Employee added successfully.');
        }
    };

    const handleEditWorker = (worker) => {
        setWorkerForm(createWorkerForm(worker));
    };

    const handleDeleteWorker = async (workerId) => {
        if (!window.confirm('Remove this employee from the roster?')) return;
        const success = await updateDatabase({
            workers: vendor.workers.filter(w => w.id !== workerId)
        });
        if (success && workerForm.id === workerId) {
            resetWorkerForm();
        }
    };

    if (loading && !isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center font-['Space_Grotesk'] text-slate-200">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Verifying Contractor Access</div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        // Step 1: show the database/org picker first (mirrors field portal).
        // The picker is shown only when (a) the registry has entries AND
        // (b) the vendor hasn't already selected one. If there are no
        // registered orgs at all, fall straight through to the login form
        // and the user just signs in against whatever DB is currently
        // configured (env vars / setup wizard).
        // Split visible vs hidden entries. By default only visible ones render;
        // the "Show hidden (N)" toggle reveals hidden entries with an un-hide
        // button so they can be restored to the picker.
        const visibleRegistry = orgRegistry.filter((e) => !e.hidden);
        const hiddenRegistry  = orgRegistry.filter((e) =>  e.hidden);
        const pickerEntries   = showHidden ? orgRegistry : visibleRegistry;
        const showOrgPicker = orgRegistry.length > 0 && pickedOrg === null;

        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-['Space_Grotesk'] text-slate-200 p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="bg-slate-900/80 backdrop-blur-xl p-10 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full relative z-10 animate-in fade-in zoom-in duration-500">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                            <i className="fas fa-hard-hat text-2xl text-white"></i>
                        </div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-wider">Contractor Portal</h1>
                        <p className="text-xs text-slate-400 mt-2 tracking-widest uppercase">Secure Compliance Gateway</p>
                    </div>

                    {showOrgPicker ? (
                        // ── Step 1: pick the organisation database ──────────────
                        <div className="space-y-5">
                            <div className="text-center">
                                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-indigo-300">Step 1 of 2</p>
                                <h2 className="mt-2 text-lg font-black text-white">Select Your Workspace</h2>
                                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                                    Choose the organisation whose vendor portal you've been invited to. Then sign in with the credentials your client admin issued.
                                </p>
                            </div>

                            <div className={`grid gap-3 ${pickerEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {pickerEntries.map((entry) => {
                                    const isCurrent = isCurrentDb(entry, currentOrgId);
                                    const isHidden  = Boolean(entry.hidden);
                                    return (
                                        <button
                                            key={entry.orgId}
                                            type="button"
                                            onClick={() => handleOrgPick(entry)}
                                            className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 ${
                                                isCurrent
                                                    ? 'border-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-900/20'
                                                    : isHidden
                                                        ? 'border-dashed border-slate-700 bg-slate-950/40 opacity-70 hover:opacity-100 hover:border-indigo-500/40'
                                                        : 'border-slate-700 bg-slate-950/60 hover:border-indigo-500/40 hover:bg-slate-900/60'
                                            }`}
                                        >
                                            {/* Hide / Unhide toggle (top-right corner) */}
                                            {isHidden ? (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label={`Restore ${entry.orgName} to picker`}
                                                    title="Restore to picker"
                                                    onClick={(e) => handleUnhideOrg(e, entry)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') handleUnhideOrg(e, entry);
                                                    }}
                                                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-indigo-400/40 bg-indigo-500/15 text-xs font-bold text-indigo-200 hover:bg-indigo-500/30"
                                                >
                                                    ↺
                                                </span>
                                            ) : (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label={`Hide ${entry.orgName} from picker`}
                                                    title="Hide from picker (restorable)"
                                                    onClick={(e) => handleHideOrg(e, entry)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') handleHideOrg(e, entry);
                                                    }}
                                                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-xs font-bold text-slate-500 opacity-0 transition-opacity duration-150 hover:border-rose-400/60 hover:bg-rose-500/20 hover:text-rose-200 group-hover:opacity-100 focus:opacity-100"
                                                >
                                                    ×
                                                </span>
                                            )}

                                            {entry.logoBase64 ? (
                                                <img src={entry.logoBase64} alt="" className="h-12 w-12 rounded-xl object-cover" />
                                            ) : (
                                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-lg font-black text-indigo-200">
                                                    {(entry.orgName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-white">{entry.orgName || 'Untitled workspace'}</p>
                                                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-slate-500">{getDbTypeLabel(entry)}</p>
                                            </div>
                                            {/* "Active" badge — moved to top-LEFT so it never collides with the hide/unhide button on the right */}
                                            {isCurrent && (
                                                <span className="absolute top-2 left-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {hiddenRegistry.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowHidden((v) => !v)}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950/40 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-indigo-500/40 hover:text-indigo-200"
                                >
                                    {showHidden
                                        ? `↑ Hide ${hiddenRegistry.length} hidden workspace${hiddenRegistry.length === 1 ? '' : 's'}`
                                        : `↓ Show ${hiddenRegistry.length} hidden workspace${hiddenRegistry.length === 1 ? '' : 's'}`}
                                </button>
                            )}

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-[11px] leading-relaxed text-slate-400">
                                Don't see your workspace? Ask your client admin to share the workspace setup link — opening it once registers the org here so it appears in this picker.
                            </div>
                        </div>
                    ) : (
                        // ── Step 2: sign in against the picked database ─────────
                        <form onSubmit={handleLogin} className="space-y-5">
                            {pickedOrg && (
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3">
                                    {pickedOrg.logoBase64 ? (
                                        <img src={pickedOrg.logoBase64} alt="" className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                                    ) : (
                                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-base font-black text-emerald-200">
                                            {(pickedOrg.orgName || '?').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-xs font-bold text-white">{pickedOrg.orgName}</p>
                                        <p className="text-[10px] text-emerald-400">✓ Workspace connected</p>
                                    </div>
                                    {orgRegistry.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={handleBackToPicker}
                                            className="rounded-lg border border-slate-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:border-indigo-500/40 hover:text-white"
                                        >
                                            Change
                                        </button>
                                    )}
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Portal Email</label>
                                <input
                                    type="email"
                                    required
                                    value={loginData.email}
                                    onChange={e => setLoginData({ ...loginData, email: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 transition-colors shadow-inner"
                                    placeholder="contractor@company.com"
                                />
                            </div>
                            {loginData.email && (
                                <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-3 text-[11px] leading-relaxed text-sky-100">
                                    This portal link already carries the registered vendor email. For the very first sign-in, use the temporary password from the vendor onboarding email. The portal will then force a password change before access continues.
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Portal Password</label>
                                <input
                                    type="password"
                                    required
                                    value={loginData.password}
                                    onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 transition-colors shadow-inner"
                                    placeholder="Enter your portal password"
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-[11px] leading-relaxed text-slate-400">
                                Use the same email your client admin saved on your contractor profile. First-time vendor users should sign in with the temporary password from the onboarding email, change it immediately when prompted, and then sign in again with the new password. If the vendor already had a shared or existing login, use <span className="font-bold text-slate-200">Forgot Password</span> instead.
                            </div>
                            <button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={loading}
                                className="w-full text-xs font-bold uppercase tracking-widest text-indigo-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                                Forgot Password
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl uppercase tracking-widest text-sm transition-transform active:scale-95 shadow-lg shadow-indigo-900/50 mt-4 disabled:opacity-50"
                            >
                                {loading ? <i className="fas fa-circle-notch fa-spin"></i> : 'Access Vendor Portal'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    const statusObj = getComplianceStatus(vendor.documents);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-['Space_Grotesk'] text-slate-200 relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none"></div>

            <header className="h-24 px-8 flex flex-col justify-center z-20 backdrop-blur-sm bg-slate-900/80 border-b border-slate-800 shadow-md gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
                            <i className="fas fa-building"></i>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white uppercase tracking-wide leading-tight">{vendor.companyName}</h1>
                            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Vendor ID: {vendor.vendorCode} | Org: {vendorSession?.orgId}</div>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-slate-800 hover:bg-red-900/50 hover:text-red-400 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm flex items-center gap-2">
                        <i className="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll z-10">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl flex items-center gap-6">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl border-4 shadow-inner ${statusObj.pct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : statusObj.pct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>
                                {statusObj.pct}%
                            </div>
                            <div>
                                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Company Compliance</h3>
                                <div className={`text-sm font-black uppercase tracking-widest ${statusObj.color.split(' ')[0]}`}>{statusObj.label}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-1">{vendor.documents.filter(d => d.file || d.status === 'Uploaded').length} of {vendor.documents.length} Docs Uploaded</div>
                            </div>
                        </div>

                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2"><i className="fas fa-users mr-2"></i>Total Workforce</h3>
                            <div className="text-4xl font-black text-white">{vendor.workers.length}</div>
                            <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">Registered Personnel</div>
                        </div>

                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2"><i className="fas fa-info-circle mr-2"></i>Contract Details</h3>
                            <div className="space-y-2 mt-3">
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Service:</span> <span className="font-bold text-indigo-300">{vendor.serviceType}</span></div>
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Contact:</span> <span className="font-bold text-white">{vendor.contactPerson}</span></div>
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Authorized Sites:</span> <span className="font-bold text-white">{vendor.allocatedSites.join(', ') || 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 border-b border-slate-800">
                        <button
                            onClick={() => setActiveTab('documentation')}
                            className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'documentation' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'}`}
                        >
                            <i className="fas fa-folder-open mr-2"></i> Documentation
                        </button>
                        <button
                            onClick={() => setActiveTab('activities')}
                            className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'activities' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'}`}
                        >
                            <i className="fas fa-hard-hat mr-2"></i> Activities & Safety
                        </button>
                    </div>

                    {activeTab === 'documentation' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-folder-open text-indigo-400"></i> Company Level Documents</h3>
                                    <p className="text-xs text-slate-400 mt-1">Please ensure all required organizational documents are uploaded and current.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendor.documents.map(doc => {
                                        const isExp = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                                        const isPending = !doc.file && doc.status !== 'Uploaded';
                                        const isUploading = uploadingId === `comp-${doc.id}`;

                                        return (
                                            <div key={doc.id} className={`p-4 rounded-2xl border shadow-sm transition-all ${isExp ? 'bg-red-950/20 border-red-500/30' : isPending ? 'bg-orange-950/10 border-orange-500/30' : 'bg-slate-950/80 border-slate-700 hover:border-slate-500'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="text-sm font-bold text-white leading-tight">{doc.name} {doc.isMandatory && <span className="text-[8px] bg-red-900/50 text-red-300 px-1.5 py-0.5 ml-2 rounded uppercase tracking-widest border border-red-500/30">Required</span>}</div>
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${doc.status === 'Uploaded' ? 'text-emerald-400' : 'text-orange-400'}`}>Status: {doc.status}</div>
                                                    </div>

                                                    {doc.file ? (
                                                        <div className="flex gap-2">
                                                            <a href={safeDocumentHref(doc.file)} target="_blank" rel="noreferrer" className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye mr-1"></i> View</a>
                                                            <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg px-3 py-1.5 transition-colors shadow-sm" title="Update Document">
                                                                <input type="file" onChange={(e) => handleCompanyDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                {isUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="relative overflow-hidden shadow-sm">
                                                            <input type="file" onChange={(e) => handleCompanyDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                            <div className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer">
                                                                {isUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-cloud-upload-alt"></i> Upload File</>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {doc.expiryDate && (
                                                    <div className={`text-[10px] font-mono mt-2 pt-2 border-t border-slate-800/50 ${isExp ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                                                        <i className="far fa-calendar-alt mr-1"></i> Expiry: {doc.expiryDate} {isExp && '(EXPIRED)'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-users-cog text-emerald-400"></i> Employee Roster & Documents</h3>
                                    <p className="text-xs text-slate-400 mt-1">Add your employees, maintain their details, and upload Medical Fitness (Form 33) and Competency Certificates.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    <form onSubmit={handleWorkerFormSubmit} className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 shadow-sm">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                                            <div>
                                                <div className="text-sm font-bold text-white">{workerForm.id ? 'Edit Employee' : 'Add Employee'}</div>
                                                <div className="text-[10px] uppercase tracking-widest text-slate-400">Vendors can manage their own employee roster here.</div>
                                            </div>
                                            {workerForm.id && (
                                                <button
                                                    type="button"
                                                    onClick={resetWorkerForm}
                                                    className="text-[10px] uppercase font-bold tracking-widest px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                                                >
                                                    Cancel Edit
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Employee Name</label>
                                                <input
                                                    type="text"
                                                    value={workerForm.name}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, name: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                    placeholder="Worker name"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Employee ID</label>
                                                <input
                                                    type="text"
                                                    value={workerForm.employeeId}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, employeeId: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                    placeholder="Badge / payroll / ID number"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Role</label>
                                                <input
                                                    type="text"
                                                    value={workerForm.role}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, role: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                    placeholder="Electrician / Fitter / Helper"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Phone</label>
                                                <input
                                                    type="text"
                                                    value={workerForm.phone}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, phone: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                    placeholder="Mobile number"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Competence</label>
                                                <input
                                                    type="text"
                                                    value={workerForm.competence}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, competence: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                    placeholder="ITI / certified / skilled trade"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Deployed Site</label>
                                                <select
                                                    value={workerForm.deployedSite}
                                                    onChange={e => setWorkerForm(prev => ({ ...prev, deployedSite: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                                                >
                                                    <option value="">Select site</option>
                                                    {vendor.allocatedSites.map(site => (
                                                        <option key={site} value={site}>{site}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-5">
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Documents can be uploaded right below after the employee is saved.</div>
                                            <button
                                                type="submit"
                                                disabled={savingWorker}
                                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors"
                                            >
                                                {savingWorker ? <><i className="fas fa-circle-notch fa-spin mr-2"></i>Saving</> : workerForm.id ? 'Update Employee' : 'Add Employee'}
                                            </button>
                                        </div>
                                    </form>

                                    {vendor.workers.map(w => {
                                        const isMedUploading = uploadingId === `worker-${w.id}-med`;
                                        const isCompUploading = uploadingId === `worker-${w.id}-comp`;

                                        return (
                                            <div key={w.id} className="p-5 rounded-2xl border border-slate-700 bg-slate-950/80 shadow-sm">
                                                <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-3 gap-4">
                                                    <div>
                                                        <div className="text-base font-bold text-white leading-tight">{w.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{w.role} | {w.competence}</div>
                                                        <div className="text-[10px] text-slate-500 mt-2">
                                                            <span className="mr-3">Site: <span className="text-slate-300 font-bold">{w.deployedSite || 'Unassigned'}</span></span>
                                                            {w.employeeId && <span className="mr-3">ID: <span className="text-slate-300 font-bold">{w.employeeId}</span></span>}
                                                            {w.phone && <span>Phone: <span className="text-slate-300 font-bold">{w.phone}</span></span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Status</div>
                                                        {!w.inductionDate || w.inductionDate === 'Pending' ? (
                                                            <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest border border-orange-500/30 px-2 py-0.5 rounded bg-orange-900/20 mb-3">Pending Induction</div>
                                                        ) : (
                                                            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-500/30 px-2 py-0.5 rounded bg-emerald-900/20 mb-3">Inducted</div>
                                                        )}
                                                        <div className="flex gap-2 justify-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditWorker(w)}
                                                                className="text-[9px] uppercase font-bold tracking-widest px-2 py-1 rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteWorker(w.id)}
                                                                className="text-[9px] uppercase font-bold tracking-widest px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-600 hover:text-white transition-colors"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                                    <div className={`p-3 rounded-xl border ${w.medDoc ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-red-950/10 border-red-500/20'}`}>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex justify-between items-center">
                                                            <span>Medical Fitness</span>
                                                            {w.medDoc ? <i className="fas fa-check-circle text-emerald-500 text-sm"></i> : <i className="fas fa-times-circle text-red-500 text-sm"></i>}
                                                        </div>

                                                        {w.medDoc ? (
                                                            <div className="flex gap-2">
                                                                <a href={safeDocumentHref(w.medDoc)} target="_blank" rel="noreferrer" className="flex-1 text-center text-[10px] bg-emerald-900/30 text-emerald-400 hover:bg-emerald-600 hover:text-white py-2 rounded-lg border border-emerald-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye"></i> View</a>
                                                                <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg w-10 flex items-center justify-center transition-colors shadow-sm" title="Update">
                                                                    <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                    {isMedUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative overflow-hidden shadow-sm">
                                                                <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                <div className="bg-slate-800 border border-slate-600 hover:border-red-500 text-white w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer">
                                                                    {isMedUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-upload"></i> Upload File</>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className={`p-3 rounded-xl border ${w.compDoc ? 'bg-blue-950/10 border-blue-500/20' : 'bg-red-950/10 border-red-500/20'}`}>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex justify-between items-center">
                                                            <span>Competency Cert.</span>
                                                            {w.compDoc ? <i className="fas fa-check-circle text-blue-500 text-sm"></i> : <i className="fas fa-times-circle text-red-500 text-sm"></i>}
                                                        </div>

                                                        {w.compDoc ? (
                                                            <div className="flex gap-2">
                                                                <a href={safeDocumentHref(w.compDoc)} target="_blank" rel="noreferrer" className="flex-1 text-center text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white py-2 rounded-lg border border-blue-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye"></i> View</a>
                                                                <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg w-10 flex items-center justify-center transition-colors shadow-sm" title="Update">
                                                                    <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                    {isCompUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative overflow-hidden shadow-sm">
                                                                <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                <div className="bg-slate-800 border border-slate-600 hover:border-red-500 text-white w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer">
                                                                    {isCompUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-upload"></i> Upload File</>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {w.additionalDocs.length > 0 && (
                                                    <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 mt-4">
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3"><i className="fas fa-folder-plus mr-1"></i> Client Specific Requests</div>
                                                        <div className="space-y-2">
                                                            {w.additionalDocs.map(doc => {
                                                                const isAddUploading = uploadingId === `worker-add-${doc.id}`;
                                                                return (
                                                                    <div key={doc.id} className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
                                                                        <span className="text-xs font-bold text-slate-300">{doc.name}</span>
                                                                        {doc.file ? (
                                                                            <div className="flex gap-2">
                                                                                <a href={safeDocumentHref(doc.file)} target="_blank" rel="noreferrer" className="text-[9px] bg-emerald-900/30 text-emerald-400 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded border border-emerald-500/30 uppercase font-bold transition-colors shadow-sm">View</a>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="relative overflow-hidden shadow-sm">
                                                                                <input type="file" onChange={(e) => handleWorkerAdditionalDocUpload(w.id, doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                                <div className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer">
                                                                                    {isAddUploading ? <i className="fas fa-spinner fa-spin"></i> : 'Upload'}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {vendor.workers.length === 0 && <div className="text-center text-slate-500 text-sm italic py-10">No employees added yet. Use the form above to register your first employee.</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'activities' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-orange-400 flex items-center gap-3"><i className="fas fa-clipboard-list"></i> Work Permits & Inspections</h3>
                                    <p className="text-xs text-slate-400 mt-1">Permits associated with your organization, including safety audit records.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendorPermits.map((p) => (
                                        <div key={p.firebaseKey} className={`p-4 rounded-xl border shadow-sm ${p.status === 'Closed' ? 'bg-slate-900 border-slate-700 opacity-70' : 'bg-orange-950/10 border-orange-500/30'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{p.permitType || p.typeId}</div>
                                                <div className="text-[10px] font-mono text-slate-500 font-bold bg-slate-950 px-2 py-1 rounded">{p.id || 'PTW'}</div>
                                            </div>
                                            <div className="text-sm text-white font-bold mb-1 leading-tight">{p.workDescription || p.description}</div>
                                            <div className="text-xs text-slate-400 mb-3"><i className="fas fa-location-dot mr-1"></i> {p.location} ({p.siteId})</div>

                                            {safeArr(p.nonCompliances).length > 0 && (
                                                <div className="mb-3 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
                                                    <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Logged Safety Violations</div>
                                                    <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                                                        {safeArr(p.nonCompliances).map((nc, i) => <li key={i}>{nc.desc || nc}</li>)}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center text-[10px] uppercase font-bold border-t border-slate-800 pt-3 mt-1">
                                                <span className="text-slate-400">{p.date || (p.validFromDate ? `${p.validFromDate}` : p.createdAt?.split('T')[0])}</span>
                                                <span className={p.status === 'Closed' ? 'text-emerald-500' : 'text-orange-500'}>{p.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {vendorPermits.length === 0 && <div className="text-center text-slate-500 text-sm italic mt-10">No active or historical permits on record.</div>}
                                </div>
                            </div>

                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-red-400 flex items-center gap-3"><i className="fas fa-briefcase-medical"></i> Incident History</h3>
                                    <p className="text-xs text-slate-400 mt-1">Records of injuries or incidents involving your assigned workforce.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendorIncidents.map((inc) => (
                                        <div key={inc.firebaseKey} className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">{inc.incidentType || inc.type || 'Incident'}</div>
                                                <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{inc.incidentDate || inc.date || 'Unknown Date'}</div>
                                            </div>
                                            <div className="text-sm text-white font-bold mb-1 leading-tight">{inc.title || ''}</div>
                                            <div className="text-xs text-slate-300 leading-relaxed mb-3">{inc.description || inc.desc || 'No description provided.'}</div>

                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-t border-slate-800 pt-3">
                                                Affected Worker: <span className="text-white">{inc.affectedPersonName || 'Unknown'}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {vendorIncidents.length === 0 && (
                                        <div className="text-center text-emerald-500 font-bold mt-10 p-6 border-2 border-dashed border-emerald-500/30 rounded-2xl bg-emerald-950/10">
                                            <i className="fas fa-shield-check text-4xl mb-3 block"></i>
                                            Excellent! Zero Incidents Recorded.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closePasswordModal}></div>
                    <form onSubmit={handleChangePassword} className="relative z-10 w-full max-w-md rounded-3xl border border-indigo-500/30 bg-slate-900 p-6 shadow-2xl">
                        <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Portal Security</p>
                                <h2 className="mt-2 text-2xl font-black text-white">{vendorSession?.mustChangePassword ? 'Password Update Required' : 'Change Password'}</h2>
                                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                    {vendorSession?.mustChangePassword
                                        ? 'This contractor portal was issued with a temporary password. Change it now before continuing.'
                                        : 'Confirm your current password, then set a new secure password for the contractor portal.'}
                                </p>
                            </div>
                            {!vendorSession?.mustChangePassword && (
                                <button
                                    type="button"
                                    onClick={closePasswordModal}
                                    disabled={isPasswordSaving}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
                                    aria-label="Close password modal"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Current Password</label>
                                <input
                                    type="password"
                                    value={passwordForm.current}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, current: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">New Password</label>
                                <input
                                    type="password"
                                    value={passwordForm.next}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, next: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                                <p className="mt-2 text-[11px] text-slate-500">Use at least 8 characters for a stronger contractor portal password.</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={passwordForm.confirm}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-5">
                            {!vendorSession?.mustChangePassword && (
                                <button
                                    type="button"
                                    onClick={closePasswordModal}
                                    disabled={isPasswordSaving}
                                    className="rounded-xl border border-slate-700 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isPasswordSaving}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                            >
                                {isPasswordSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Updating</> : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
