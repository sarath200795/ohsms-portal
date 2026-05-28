import React, { useEffect, useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { dbGet, dbPush, dbRemove, dbSet, dbUpdate } from '../../services/db/index.js';
import { writeActivityLog, buildActivityEntry } from '../../utils/activityLog.js';
import { auth, firebaseConfig } from '../../config/firebase';
import { fileToBase64, safeArr } from '../../utils/helpers';
import { getMandatoryDocs, GOODS_TYPES, SERVICE_TYPES } from '../../utils/constants';
import { readOrgChildren } from '../../utils/orgData';
import ContractorBuilder from './components/ContractorBuilder';
import ContractorRegistry from './components/ContractorRegistry';
import WorkersView from './components/WorkersView';
import DeploymentsView from './components/DeploymentsView';
import AddWorkerModal from './components/AddWorkerModal';
import CompanyProfileModal from './components/CompanyProfileModal';
import PortalSuccessModal from './components/PortalSuccessModal';
import WorkerProfileModal from './components/WorkerProfileModal';
import {
    createEmptyVendorForm,
    generateVendorCode,
    getComplianceStatus,
    normalizeEmail,
    normalizeVendorCode,
    parseContractors
} from './utils';
import { canEditCreateForRole, getAllowedSiteCodes, hasAccessibleModule, isGlobalOwnerRole } from '../../utils/permissions';
import { readStoredSession } from '../../utils/session';
import { generateVendorPortalPassword } from '../../utils/security';
import { buildRegionOptions, filterSitesByRegion, matchesRegionFilter, normalizeSites } from '../../utils/siteRegions';
// Removed import of buildVendorCredentialMailto / isVendorCredentialEmailConfigured /
// sendVendorCredentialEmail — the vendor provisioning flow no longer emails
// credentials (vendor uses Firebase's built-in Forgot Password reset email
// from the portal sign-in screen instead).

const buildVendorPortalUrl = (email = '', options = {}) => {
    const url = new URL('/vendor-portal', window.location.origin);
    if (email) {
        url.searchParams.set('email', normalizeEmail(email));
        url.searchParams.set('source', 'contractor-management');
    }
    if (options.orgId) url.searchParams.set('orgId', options.orgId);
    if (options.contractorId) url.searchParams.set('contractorId', options.contractorId);
    if (options.siteId) url.searchParams.set('siteId', options.siteId);
    if (options.bootstrap) url.searchParams.set('bootstrap', '1');
    return url.toString();
};

const buildVendorSiteLabel = (siteCode, sites) => {
    const matchingSite = safeArr(sites).find((site) => site.code === siteCode);
    return matchingSite ? `${matchingSite.name} (${matchingSite.code})` : siteCode;
};

export default function Contractors() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('companies');

    const [contractors, setContractors] = useState([]);
    const [orgUsers, setOrgUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');
    const [workerCompanyFilter, setWorkerCompanyFilter] = useState('All');
    const [deploymentCompanyFilter, setDeploymentCompanyFilter] = useState('All');
    const [saving, setSaving] = useState(false);

    const [globalTrainings, setGlobalTrainings] = useState([]);
    const [globalPermits, setGlobalPermits] = useState([]);
    const [globalIncidents, setGlobalIncidents] = useState([]);

    const [formData, setFormData] = useState(createEmptyVendorForm());
    const [addWorkerData, setAddWorkerData] = useState({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });

    const [activeVendor, setActiveVendor] = useState(null);
    const [editingVendor, setEditingVendor] = useState(null);
    const [activeWorker, setActiveWorker] = useState(null);
    const [modalType, setModalType] = useState(null);
    const [newDocReq, setNewDocReq] = useState('');
    const [newWorkerDocReq, setNewWorkerDocReq] = useState('');
    const [portalProvisioning, setPortalProvisioning] = useState(false);
    const [portalSuccess, setPortalSuccess] = useState(null);

    // (Pending vendor-registration modal state was removed — vendor approvals
    //  now happen in the unified Users page; nothing here listens for them.)

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) {
            navigate('/');
            return;
        }

        const isGlobalAdmin = isGlobalOwnerRole(sess.role);
        const hasModuleAccess = isGlobalAdmin || hasAccessibleModule(sess.accessibleModules, 'Contractors');

        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission.');
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && ctxSite === 'All') {
            ctxSite = sess.assignedSite;
        }

        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const data = await readOrgChildren(null, sess.orgId, ['contractors', 'users', 'sites', 'trainings', 'ptwRecords', 'incidents']);

                if (data.contractors) setContractors(parseContractors(data.contractors));
                if (data.users) {
                    setOrgUsers(
                        Object.entries(data.users).map(([key, value]) => ({
                            firebaseKey: key,
                            ...value,
                            email: normalizeEmail(value.email)
                        }))
                    );
                }
                if (data.sites) {
                    setSites(normalizeSites(data.sites));
                }
                if (data.trainings) setGlobalTrainings(safeArr(data.trainings));
                if (data.ptwRecords) {
                    const permitArr = Array.isArray(data.ptwRecords)
                        ? data.ptwRecords.filter(Boolean).map((value, index) => ({ ...value, firebaseKey: String(index) }))
                        : Object.entries(data.ptwRecords).map(([key, value]) => ({ ...value, firebaseKey: key }));
                    setGlobalPermits(permitArr);
                }
                if (data.incidents) {
                    const incidentArr = Array.isArray(data.incidents)
                        ? data.incidents.filter(Boolean).map((value, index) => ({ ...value, firebaseKey: String(index) }))
                        : Object.entries(data.incidents).map(([key, value]) => ({ ...value, firebaseKey: key }));
                    setGlobalIncidents(incidentArr);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [location.search, navigate]);

    const isGlobalUser = isGlobalOwnerRole(session?.role);
    const canEdit = canEditCreateForRole(session?.role);

    useEffect(() => {
        // Legacy redirect — Register Vendor view no longer exists.  Kept
        // the effect in case any deep link tries to land on it.
        if (session && view === 'register') {
            setView('companies');
        }
    }, [canEdit, session, view]);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [allowedSiteCodes, isGlobalUser, sites]);

    const regionOptions = useMemo(() => buildRegionOptions(visibleSites), [visibleSites]);

    const filteredVisibleSites = useMemo(
        () => filterSitesByRegion(visibleSites, regionFilter),
        [visibleSites, regionFilter]
    );

    useEffect(() => {
        if (siteFilter !== 'All' && regionFilter !== 'All' && !matchesRegionFilter(siteFilter, visibleSites, regionFilter)) {
            setSiteFilter('All');
            sessionStorage.setItem('isoCurrentSite', 'GLOBAL');
        }
    }, [regionFilter, siteFilter, visibleSites]);

    const visibleContractors = useMemo(() => {
        return contractors.filter((contractor) => {
            if (
                !isGlobalUser &&
                session?.assignedSite !== 'GLOBAL' &&
                !safeArr(contractor.allocatedSites).includes(session?.assignedSite) &&
                !safeArr(session?.accessibleSites).some((site) => safeArr(contractor.allocatedSites).includes(site))
            ) {
                return false;
            }

            if (siteFilter !== 'All' && !safeArr(contractor.allocatedSites).includes(siteFilter)) {
                return false;
            }

            if (regionFilter !== 'All') {
                const contractorRegions = safeArr(contractor.allocatedSites).map((siteCode) => visibleSites.find((site) => site.code === siteCode)?.region).filter(Boolean);
                if (!contractorRegions.includes(regionFilter)) return false;
            }

            return true;
        });
    }, [contractors, isGlobalUser, regionFilter, session, siteFilter, visibleSites]);

    const allWorkers = useMemo(() => {
        const list = [];

        visibleContractors.forEach((contractor) => {
            if (workerCompanyFilter !== 'All' && contractor.firebaseKey !== workerCompanyFilter) return;

            safeArr(contractor.workers).forEach((worker) => {
                const workerName = typeof worker.name === 'string' ? worker.name.toLowerCase() : '';
                if (!workerName) return;

                const trainingsList = globalTrainings.filter((training) =>
                    safeArr(training.attendees).some((attendee) => {
                        const attendeeName = typeof attendee === 'object' ? (attendee.name || '') : (typeof attendee === 'string' ? attendee : '');
                        return attendeeName.toLowerCase() === workerName && (typeof attendee === 'object' ? attendee.status === 'Attended' : true);
                    })
                );

                const injuriesList = [
                    ...safeArr(contractor.incidents)
                        .filter((incident) => typeof incident.desc === 'string' && incident.desc.toLowerCase().includes(workerName))
                        .map((incident) => ({
                            type: incident.type || 'Incident',
                            date: incident.date,
                            desc: incident.desc || incident.description,
                            id: incident.id || 'Local'
                        })),
                    ...globalIncidents
                        .filter((incident) => incident.affectedPersonType === 'Contractor' && incident.affectedPersonId === worker.id)
                        .map((incident) => ({
                            type: incident.incidentType || incident.type,
                            date: incident.incidentDate || incident.date,
                            desc: incident.description || incident.title,
                            id: incident.id || incident.firebaseKey
                        }))
                ];

                list.push({
                    ...worker,
                    companyName: contractor.companyName || 'Unknown Vendor',
                    contractorId: contractor.firebaseKey,
                    trainingsList,
                    injuriesList
                });
            });
        });

        return list.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
    }, [globalIncidents, globalTrainings, visibleContractors, workerCompanyFilter]);

    const refreshContractors = async () => {
        const snap = await dbGet(`organizations/${session.orgId}/contractors`);
        if (snap !== null) {
            setContractors(parseContractors(snap));
        }
    };

    const toggleAllocatedSite = (code) => {
        setFormData((prev) => {
            const exists = prev.allocatedSites.includes(code);
            return {
                ...prev,
                allocatedSites: exists ? prev.allocatedSites.filter((site) => site !== code) : [...prev.allocatedSites, code]
            };
        });
    };

    const handleServiceTypeChange = (event) => {
        const type = event.target.value;
        setFormData((prev) => ({ ...prev, serviceType: type, documents: getMandatoryDocs(type, prev.goodsType) }));
    };

    const handleGoodsTypeChange = (event) => {
        const goodsType = event.target.value;
        setFormData((prev) => ({ ...prev, goodsType, documents: getMandatoryDocs(prev.serviceType, goodsType) }));
    };

    const saveVendorRegistration = async () => {
        if (!formData.companyName || formData.allocatedSites.length === 0 || !normalizeEmail(formData.email)) {
            alert('Company Name, vendor email, and at least one Site Allocation are required.');
            return;
        }

        setSaving(true);
        try {
            let createdVendor = null;
            const payload = {
                ...formData,
                email: normalizeEmail(formData.email),
                siteId: formData.allocatedSites[0],
                updatedBy: session.name,
                lastUpdated: new Date().toISOString()
            };

            if (!payload.createdAt) {
                payload.createdAt = new Date().toISOString();
                payload.vendorCode = generateVendorCode();
            }

            const keyToUpdate = formData.firebaseKey;
            delete payload.firebaseKey;

            if (keyToUpdate) {
                await dbUpdate(`organizations/${session.orgId}/contractors/${keyToUpdate}`, payload);
                writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'contractor.updated', module: 'Contractors', collection: 'contractors', recordId: keyToUpdate, recordTitle: payload.companyName || '', siteId: payload.siteId }));
            } else {
                // dbPush returns the new key as a STRING (not a ref object) —
                // see services/db/adapters/firebase.js. Previous code used
                // createdRef.key which evaluated to undefined, so the vendor
                // saved fine but createdVendor.firebaseKey was missing and
                // the post-save Company Profile modal opened against an
                // anonymous vendor, breaking provisioning.
                const newKey = await dbPush(`organizations/${session.orgId}/contractors`, payload);
                createdVendor = {
                    ...payload,
                    firebaseKey: newKey,
                    allocatedSites: safeArr(payload.allocatedSites),
                    documents: safeArr(payload.documents),
                    workers: safeArr(payload.workers),
                    trainings: safeArr(payload.trainings),
                    incidents: safeArr(payload.incidents),
                    nonCompliances: safeArr(payload.nonCompliances)
                };
                writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'contractor.created', module: 'Contractors', collection: 'contractors', recordId: newKey, recordTitle: payload.companyName || '', siteId: payload.siteId }));
            }

            // At this point the dbPush/dbUpdate has succeeded and the vendor
            // is on disk. Everything below is post-save UI plumbing; failures
            // there must NOT bubble up as 'Save failed' or the admin will
            // think nothing happened and try to register again, creating
            // duplicates. Catch + log each step so the success path is
            // unambiguous.
            try { await refreshContractors(); } catch (refreshErr) {
                console.warn('Vendor saved but contractor list refresh failed:', refreshErr);
            }
            setView('companies');
            setFormData(createEmptyVendorForm());

            if (createdVendor && isGlobalUser && normalizeEmail(createdVendor.email)) {
                setActiveVendor(createdVendor);
                setEditingVendor(null);
                setModalType('company_profile');
            }
            alert('Vendor Registered/Updated Successfully!');
        } catch (error) {
            // Log to console so the developer can see the FULL error object
            // (Firebase RTDB permission-denied errors carry .code and .name
            // that the user-facing message doesn't surface).
            console.error('[saveVendorRegistration] failed:', error);
            const detail = error?.code === 'PERMISSION_DENIED'
                ? '\n\nThe Firebase database refused the write. The most common cause is that database.rules.json has not been deployed yet — run "npm run firebase:rules" and try again.'
                : '\n\nIf the vendor name now appears in the registry, the save did succeed — only the post-save UI hit an error. Refresh the page to confirm before re-registering.';
            alert('Save failed: ' + (error?.message || error?.code || 'Unknown error') + detail);
        } finally {
            setSaving(false);
        }
    };

    const updateVendorDB = async (vendorKey, payload) => {
        try {
            await dbUpdate(`organizations/${session.orgId}/contractors/${vendorKey}`, payload);

            setContractors((prev) => prev.map((contractor) => {
                if (contractor.firebaseKey !== vendorKey) return contractor;
                return {
                    ...contractor,
                    ...payload,
                    allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(contractor.allocatedSites),
                    documents: payload.documents ? safeArr(payload.documents) : safeArr(contractor.documents),
                    workers: payload.workers ? safeArr(payload.workers) : safeArr(contractor.workers)
                };
            }));

            if (activeVendor && activeVendor.firebaseKey === vendorKey) {
                setActiveVendor((prev) => ({
                    ...prev,
                    ...payload,
                    allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(prev.allocatedSites),
                    documents: payload.documents ? safeArr(payload.documents) : safeArr(prev.documents),
                    workers: payload.workers ? safeArr(payload.workers) : safeArr(prev.workers)
                }));
            }
        } catch {
            alert('Failed to update database.');
        }
    };

    const saveCompanyProfileEdit = () => {
        if (!editingVendor.companyName || safeArr(editingVendor.allocatedSites).length === 0 || !normalizeEmail(editingVendor.email)) {
            alert('Company Name, portal email, and Site Allocation are required.');
            return;
        }

        updateVendorDB(activeVendor.firebaseKey, {
            companyName: editingVendor.companyName,
            allocatedSites: editingVendor.allocatedSites,
            siteId: editingVendor.allocatedSites[0],
            serviceType: editingVendor.serviceType,
            goodsType: editingVendor.goodsType || '',
            contactPerson: editingVendor.contactPerson,
            phone: editingVendor.phone,
            email: normalizeEmail(editingVendor.email),
            updatedBy: session.name,
            lastUpdated: new Date().toISOString()
        });
        setEditingVendor(null);
    };

    // (Vendor self-registration approve/reject handlers were removed —
    //  vendor approvals now flow through the unified Users page. See
    //  Users.handleSaveUser which detects vendorPortal: true on a pending
    //  user and creates the contractor + vendorPortalUsers records as a
    //  post-approval side-effect.)

    const provisionVendorPortalAccess = async () => {
        if (!isGlobalUser) {
            alert('Only the Global Owner can provision contractor portal accounts.');
            return;
        }
        if (!activeVendor?.firebaseKey) {
            alert('Vendor profile is not loaded.');
            return;
        }

        const vendorEmail = normalizeEmail(activeVendor.email);
        if (!vendorEmail) {
            alert('Add a contractor email address before provisioning portal access.');
            return;
        }

        const vendorCode = normalizeVendorCode(activeVendor.vendorCode);
        if (!vendorCode) {
            alert('Vendor code is missing on this contractor profile.');
            return;
        }

        setPortalProvisioning(true);

        // Declared early so the collision-detection branch below can append
        // to it without hitting a TDZ error.
        let provisioningWarning = '';

        try {
            const nowIso = new Date().toISOString();
            const allocatedSites = safeArr(activeVendor.allocatedSites);
            const primarySite = allocatedSites[0] || activeVendor.siteId || 'GLOBAL';
            const primarySiteLabel = buildVendorSiteLabel(primarySite, sites);
            const matchingOrgUsers = orgUsers.filter((user) => (
                (activeVendor.portalUid && user.firebaseKey === activeVendor.portalUid) ||
                normalizeEmail(user.email) === vendorEmail
            ));

            // ── Collision detection (informational only) ────────────────────
            // After the vendorPortalUsers refactor, vendor records live in a
            // SEPARATE collection from org members. Even when a vendor's
            // email collides with an existing employee's email (Firebase Auth
            // shares the uid), the vendor write goes to vendorPortalUsers/<uid>
            // and physically cannot touch the employee's record at users/<uid>.
            //
            // So the old "refuse and block" gate is no longer necessary for
            // data safety. We still detect collisions so we can WARN the
            // admin (the vendor will share a sign-in password with the
            // employee, which has UX implications) — but we do NOT block.
            const collidingEmployee = matchingOrgUsers.find((user) => {
                if (activeVendor.portalUid && user.firebaseKey === activeVendor.portalUid) {
                    return false;
                }
                if (user.status === 'Deleted') return false;
                // An admin-role match is always a colliding employee, even
                // if a previous buggy provisioning set vendorPortal:true on
                // them. A non-admin match is only colliding if it isn't
                // already a vendor portal user.
                if (user.role === 'Global Owner' || user.role === 'Site Owner') return true;
                return user.vendorPortal !== true;
            });
            if (collidingEmployee) {
                const adminRole = collidingEmployee.role === 'Global Owner' || collidingEmployee.role === 'Site Owner';
                provisioningWarning =
                    `Note: the vendor email "${vendorEmail}" matches an existing ` +
                    `${collidingEmployee.role || 'organisation'} account ` +
                    `("${collidingEmployee.name || collidingEmployee.email}"). ` +
                    `The vendor's portal record is stored separately so the existing ` +
                    `account's role and permissions are NOT touched, ` +
                    (adminRole
                        ? `but the vendor will share a Firebase sign-in password with that admin. ` +
                          `Consider using a contractor-owned email for cleaner separation.`
                        : `but the vendor will share a Firebase sign-in password with that user. ` +
                          `Consider using a distinct email if that's a problem.`);
            }

            // Only "reuse" a record that's already a vendor portal user
            // AND NOT an admin role (paranoid: the gate above should have
            // already rejected admin roles, but we double-check here so
            // existingOrgUser can never be a Global Owner / Site Owner
            // even if the gate logic ever drifts).
            const isVendorReusable = (user) =>
                user.vendorPortal === true &&
                user.role !== 'Global Owner' &&
                user.role !== 'Site Owner';
            const existingOrgUser =
                matchingOrgUsers.find((user) => activeVendor.portalUid && user.firebaseKey === activeVendor.portalUid && isVendorReusable(user))
                || matchingOrgUsers.find((user) => isVendorReusable(user) && user.status === 'Active')
                || matchingOrgUsers.find((user) => isVendorReusable(user))
                || null;
            const reusingExistingOrgIdentity = Boolean(existingOrgUser?.firebaseKey);

            let portalUid = activeVendor.portalUid || existingOrgUser?.firebaseKey || '';
            let createdPortalAuthUser = false;
            // First-login password we set on the vendor's Firebase Auth
            // account. Reset on every provisioning attempt — currently the
            // Vendor Reference Code, used once before the portal forces a
            // password change. See the rotatePortalPassword closure below.
            let issuedPortalPassword = '';
            let portalBootstrapPending = false;
            const baseUserPayload = {
                name: activeVendor.contactPerson || activeVendor.companyName || 'Vendor Portal User',
                email: vendorEmail,
                role: existingOrgUser?.role || 'User',
                status: 'Active',
                assignedSite: existingOrgUser?.assignedSite || primarySite,
                accessibleSites: Array.from(new Set([...(safeArr(existingOrgUser?.accessibleSites)), ...allocatedSites].filter(Boolean))),
                accessibleModules: safeArr(existingOrgUser?.accessibleModules),
                vendorPortal: true,
                portalLinkedContractorId: activeVendor.firebaseKey,
                updatedBy: session.email,
                updatedAt: nowIso
            };

            if (!reusingExistingOrgIdentity) {
                const tempAppName = `vendorPortal-${Date.now()}`;
                const tempApp = initializeApp(auth.app.options, tempAppName);
                const tempAuth = getAuth(tempApp);

                try {
                    // The vendor's first-login password is the Vendor Reference
                    // Code — that's a value the admin already knows and can
                    // share verbally / via WhatsApp / SMS, without depending on
                    // Firebase's password-reset email landing in the vendor's
                    // inbox.  Once they sign in, mustChangePassword is true so
                    // the portal forces them to set their own password before
                    // they can do anything else.
                    const rotatePortalPassword = async (credentialUser) => {
                        await updatePassword(credentialUser, vendorCode);
                        issuedPortalPassword = vendorCode;
                        return vendorCode;
                    };

                    if (portalUid) {
                        try {
                            const existingCredential = await signInWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                            portalUid = existingCredential.user.uid;
                            // Already signed in with vendorCode — nothing to
                            // rotate, just record what they'll use.
                            issuedPortalPassword = vendorCode;
                        } catch (authError) {
                            const authCode = authError?.code || '';
                            if (
                                authCode === 'auth/invalid-credential' ||
                                authCode === 'auth/invalid-login-credentials' ||
                                authCode === 'auth/user-not-found' ||
                                authCode === 'auth/wrong-password'
                            ) {
                                try {
                                    const userCredential = await createUserWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                                    portalUid = userCredential.user.uid;
                                    createdPortalAuthUser = true;
                                    issuedPortalPassword = vendorCode;
                                    provisioningWarning = existingOrgUser?.firebaseKey && existingOrgUser.firebaseKey !== portalUid
                                        ? 'The saved portal mapping was stale, so a fresh vendor auth account was recreated and linked automatically.'
                                        : provisioningWarning;
                                } catch (createError) {
                                    if (createError?.code === 'auth/email-already-in-use') {
                                        // Email exists with a different password — rotate it back to vendorCode.
                                        // We can't sign in without the real password, but the admin can re-issue
                                        // the vendor code by clicking "Send Password Reset Email" on the success
                                        // modal afterwards.
                                        portalBootstrapPending = true;
                                        provisioningWarning = 'This email already has a Firebase Auth account with a different password. Click "Send Password Reset Email" on the next screen so the vendor can choose a new one.';
                                    }
                                    else throw createError;
                                }
                            } else {
                                throw authError;
                            }
                        }
                    } else {
                        try {
                            const existingCredential = await signInWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                            portalUid = existingCredential.user.uid;
                            issuedPortalPassword = vendorCode;
                        } catch (authError) {
                            const authCode = authError?.code || '';
                            if (
                                authCode === 'auth/invalid-credential' ||
                                authCode === 'auth/invalid-login-credentials' ||
                                authCode === 'auth/user-not-found' ||
                                authCode === 'auth/wrong-password'
                            ) {
                                try {
                                    const userCredential = await createUserWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                                    portalUid = userCredential.user.uid;
                                    createdPortalAuthUser = true;
                                    issuedPortalPassword = vendorCode;
                                } catch (createError) {
                                    if (createError?.code === 'auth/email-already-in-use') {
                                        portalBootstrapPending = true;
                                        provisioningWarning = 'This email already has a Firebase Auth account with a different password. Click "Send Password Reset Email" on the next screen so the vendor can choose a new one.';
                                    }
                                    else throw createError;
                                }
                            } else {
                                throw authError;
                            }
                        }
                    }
                } finally {
                    await signOut(tempAuth).catch(() => {});
                }
            }

            if (!portalUid && !portalBootstrapPending) {
                throw new Error('Unable to provision a vendor portal auth account for this contractor.');
            }

            // ── NEW FLOW (no admin-side emails) ──────────────────────────────
            // The previous flow tried to email the vendor a temporary password
            // (via EmailJS) and, when EmailJS wasn't configured, fell back to
            // a mailto: draft the admin had to send manually. Both paths were
            // unreliable: EmailJS needs env-var setup the user can't do, and
            // the mailto popup was confusing / often blocked.
            //
            // New behavior: provisioning creates the Firebase Auth account and
            // writes the RTDB records, then STOPS. The vendor receives nothing
            // from us. They are told (via the success modal) to:
            //   1. open the portal URL the admin shares with them,
            //   2. enter their registered email,
            //   3. click "Forgot Password" — Firebase Auth's built-in reset
            //      email handles delivery using the project's own SMTP /
            //      transport configured in Firebase Console.
            //   4. set their own password and sign in.
            //
            // This sidesteps every email-delivery failure mode entirely. The
            // temporary password we generated in the previous step is just to
            // satisfy Firebase Auth's "must have a password" requirement at
            // account creation; we never surface it to the admin or vendor.
            const portalUrl = buildVendorPortalUrl(vendorEmail, {
                orgId: session?.orgId,
                contractorId: activeVendor.firebaseKey,
                siteId: primarySite
            });
            // Don't mark mustChangePassword — vendor will choose their own
            // password via the reset link, no need for the portal to force
            // another change immediately after.
            // We did set the vendor's Firebase Auth password (to the Vendor
            // Reference Code) so the portal must force a password change on
            // first sign-in. The vendor portal honours mustChangePassword.
            const portalPasswordManaged = Boolean(issuedPortalPassword);
            const setupEmailSent = false;
            const credentialEmailSent = false;
            const manualCredentialDraftUrl = '';
            if (portalUid) {
                // The new flow does NOT send any emails from this app — the
                // vendor uses Firebase's Forgot Password reset link from the
                // portal sign-in screen. So credentialEmailSent and the
                // setupEmail "did we mail them?" flag are both always false,
                // and references to the old credentialDispatch / setupEmail
                // objects were left dangling — re-using the existing
                // record's timestamps keeps the audit columns coherent.
                const nextUserPayload = {
                    ...baseUserPayload,
                    status: 'Active',
                    mustChangePassword: portalPasswordManaged,
                    temporaryPasswordIssued: portalPasswordManaged,
                    temporaryPasswordIssuedAt: portalPasswordManaged ? nowIso : null,
                    passwordUpdatedAt: portalPasswordManaged ? null : (existingOrgUser?.passwordUpdatedAt || null),
                    portalCredentialEmailSentAt: existingOrgUser?.portalCredentialEmailSentAt || null,
                    portalCredentialEmailSentBy: existingOrgUser?.portalCredentialEmailSentBy || null,
                    portalSetupLinkSentAt: existingOrgUser?.portalSetupLinkSentAt || null,
                    portalSetupLinkSentBy: existingOrgUser?.portalSetupLinkSentBy || null,
                    portalSharedIdentity: reusingExistingOrgIdentity
                };

                // ── WRITE TO vendorPortalUsers — NOT users ──────────────────
                // The vendor portal record now lives in its own isolated
                // collection so it can NEVER overwrite an org member's record
                // when the vendor's email collides with an employee's email
                // (Firebase Auth shares the same uid across both contexts).
                //
                // The main app's user-management screen reads from `users` and
                // is unaffected; vendor portal sign-in reads from
                // `vendorPortalUsers` (with fallback to `users` for vendors
                // provisioned before this refactor — see VendorPortal.jsx).
                await dbUpdate(`organizations/${session.orgId}/vendorPortalUsers/${portalUid}`, nextUserPayload);
                // userPasswordState path stays the same — it's keyed by uid,
                // not collection-specific, and is read by both contexts. The
                // password reset flow uses Firebase Auth directly so this is
                // mostly cosmetic now.
                await dbUpdate(`organizations/${session.orgId}/userPasswordState/${portalUid}`, {
                    mustChangePassword: nextUserPayload.mustChangePassword,
                    temporaryPasswordIssued: nextUserPayload.temporaryPasswordIssued,
                    temporaryPasswordIssuedAt: nextUserPayload.temporaryPasswordIssuedAt || '',
                    passwordUpdatedAt: nextUserPayload.passwordUpdatedAt || ''
                });
                // The "supersede previous user record" branch is no longer
                // needed: we never wrote a stray vendor row into `users`
                // in the first place. Existing legacy vendor rows in `users`
                // will be cleaned up by a one-time migration if/when needed.

                try {
                    await dbSet(`userDirectory/${portalUid}`, { orgId: session.orgId });
                } catch (dirError) {
                    const dirMessage = String(dirError?.message || '').toLowerCase();
                    if (dirMessage.includes('permission denied')) {
                        if (!createdPortalAuthUser && existingOrgUser) {
                            provisioningWarning = provisioningWarning || 'Portal access was linked to an existing organization user. The userDirectory record could not be recreated from this screen, which usually means it already exists. If login still fails, verify that userDirectory points this user to the correct organization.';
                        } else {
                            throw new Error('This vendor email is already tied to a Firebase Auth account that cannot be linked automatically from this screen. If that account already belongs to another org or already has a userDirectory entry, please fix it in Firebase first and then provision again.');
                        }
                    } else {
                        throw dirError;
                    }
                }

                await updateVendorDB(activeVendor.firebaseKey, {
                    email: vendorEmail,
                    portalUid,
                    // Provisioning succeeded → vendor profile is Active so the
                    // contractor can show up in pickers, reports, and the
                    // contractor safety-passport flow. Was previously left at
                    // whatever the admin had set when the profile was created.
                    status: 'Active',
                    portalSharedIdentity: reusingExistingOrgIdentity,
                    portalBootstrapPending: false,
                    portalBootstrapEmail: '',
                    portalAssignedSite: primarySite,
                    portalProvisionedAt: nowIso,
                    portalProvisionedBy: session.email,
                    // No emails are sent from this app in the new flow —
                    // keep whatever timestamps the previous record had so the
                    // audit columns don't lie.
                    portalCredentialEmailSentAt: activeVendor.portalCredentialEmailSentAt || null,
                    portalCredentialEmailSentBy: activeVendor.portalCredentialEmailSentBy || null,
                    portalSetupLinkSentAt: activeVendor.portalSetupLinkSentAt || null,
                    portalSetupLinkSentBy: activeVendor.portalSetupLinkSentBy || null,
                    portalPasswordRotatedAt: portalPasswordManaged ? nowIso : (activeVendor.portalPasswordRotatedAt || null),
                    portalPasswordRotatedBy: portalPasswordManaged ? session.email : (activeVendor.portalPasswordRotatedBy || null)
                });

                setOrgUsers((prev) => {
                    const nextUser = { firebaseKey: portalUid, ...nextUserPayload };
                    const updated = prev.map((user) => (
                        existingOrgUser?.firebaseKey && user.firebaseKey === existingOrgUser.firebaseKey && existingOrgUser.firebaseKey !== portalUid
                            ? {
                                ...user,
                                status: 'Deleted',
                                vendorPortal: false,
                                portalLinkedContractorId: '',
                                supersededByUid: portalUid,
                                deletedAt: nowIso,
                                deletedBy: session.email || session.name || 'Global Owner'
                            }
                            : user
                    ));
                    const index = updated.findIndex((user) => user.firebaseKey === portalUid);
                    if (index === -1) return [...updated, nextUser];
                    updated[index] = { ...updated[index], ...nextUser };
                    return updated;
                });
            } else {
                await updateVendorDB(activeVendor.firebaseKey, {
                    email: vendorEmail,
                    portalUid: '',
                    portalSharedIdentity: false,
                    portalBootstrapPending: true,
                    portalBootstrapEmail: vendorEmail,
                    portalAssignedSite: primarySite,
                    portalProvisionedAt: nowIso,
                    portalProvisionedBy: session.email,
                    // Same as above: new flow doesn't send emails from here.
                    portalCredentialEmailSentAt: activeVendor.portalCredentialEmailSentAt || null,
                    portalCredentialEmailSentBy: activeVendor.portalCredentialEmailSentBy || null,
                    portalSetupLinkSentAt: activeVendor.portalSetupLinkSentAt || null,
                    portalSetupLinkSentBy: activeVendor.portalSetupLinkSentBy || null,
                    portalPasswordRotatedAt: null,
                    portalPasswordRotatedBy: null
                });
            }

            setPortalSuccess({
                companyName: activeVendor.companyName,
                email: vendorEmail,
                vendorCode,
                // Carry scope so the reset-email button on the success modal
                // builds the same actionCodeSettings URL we'd use elsewhere.
                contractorId: activeVendor.firebaseKey,
                siteId: primarySite,
                orgId: session?.orgId,
                // First-login password — the Vendor Reference Code. The portal
                // forces a password change immediately after, so the value is
                // single-use and disposable. Admin shares this verbally or via
                // chat; no reliance on Firebase's email transport.
                temporaryPassword: issuedPortalPassword || '',
                linkedExisting: !createdPortalAuthUser,
                sharedIdentity: reusingExistingOrgIdentity,
                bootstrapPending: portalBootstrapPending,
                portalUrl,
                credentialEmailSent,            // always false in the new flow
                credentialEmailSentAt: '',
                manualCredentialDraftUrl,       // always '' in the new flow
                setupEmailSent,                 // always false in the new flow
                setupEmailSentAt: '',
                firstLoginRequiresPasswordChange: portalPasswordManaged,
                // Flag the success modal keys off to render the Forgot
                // Password fallback instructions.  Only true when we couldn't
                // set the vendor-code password (e.g., bootstrapPending or the
                // auth account already existed with a different password).
                resetFlowRequired: !issuedPortalPassword,
                warning: provisioningWarning
            });
            // No more auto-open mailto — vendors use Firebase's own reset email
            // by clicking Forgot Password on the portal sign-in screen.
        } catch (error) {
            alert('Portal provisioning failed: ' + error.message);
        } finally {
            setPortalProvisioning(false);
        }
    };

    const handleDocUpload = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        const base64 = await fileToBase64(file);
        const updatedDocs = safeArr(activeVendor.documents).map((doc) => (
            doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
        ));
        updateVendorDB(activeVendor.firebaseKey, { documents: updatedDocs });
    };

    const requestAdditionalDoc = () => {
        if (!newDocReq) return;
        const newDoc = { id: Date.now().toString(), type: 'Requested', name: newDocReq, isMandatory: false, status: 'Requested' };
        updateVendorDB(activeVendor.firebaseKey, { documents: [...safeArr(activeVendor.documents), newDoc] });
        setNewDocReq('');
    };

    const submitNewWorker = async () => {
        if (!addWorkerData.contractorId || !addWorkerData.name || !addWorkerData.competence || !addWorkerData.deployedSite) {
            alert('Company, Name, Competence, and Deployed Site are required.');
            return;
        }

        const vendorData = await dbGet(`organizations/${session.orgId}/contractors/${addWorkerData.contractorId}`);
        if (vendorData !== null) {
            const newWorkerObj = {
                id: Date.now().toString(),
                name: addWorkerData.name,
                role: addWorkerData.role,
                competence: addWorkerData.competence,
                deployedSite: addWorkerData.deployedSite,
                inductionDate: 'Pending',
                additionalDocs: []
            };

            await dbUpdate(
                `organizations/${session.orgId}/contractors/${addWorkerData.contractorId}`,
                { workers: [...safeArr(vendorData.workers), newWorkerObj] }
            );
            await refreshContractors();
            setModalType(null);
            setAddWorkerData({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });
            alert('Worker added successfully! You can now upload their documents from their profile.');
        }
    };

    const removeWorkerFromProfile = (contractorId, workerId) => {
        if (!window.confirm('Remove this worker from the roster permanently?')) return;
        const vendor = contractors.find((contractor) => contractor.firebaseKey === contractorId);
        if (!vendor) return;
        updateVendorDB(contractorId, { workers: safeArr(vendor.workers).filter((worker) => worker.id !== workerId) });
    };

    const quickUpdateWorkerDeployment = (contractorId, workerId, newSite) => {
        const vendor = contractors.find((contractor) => contractor.firebaseKey === contractorId);
        if (!vendor) return;
        const updatedWorkers = safeArr(vendor.workers).map((worker) => (
            worker.id === workerId ? { ...worker, deployedSite: newSite } : worker
        ));
        updateVendorDB(contractorId, { workers: updatedWorkers });
    };

    const sendVendorPortalSetupLink = async ({ vendorEmail, contractorId = '', siteId = '', bootstrap = false }) => {
        const cleanEmail = normalizeEmail(vendorEmail);
        if (!cleanEmail) {
            throw new Error('Portal email is missing on this contractor profile.');
        }

        const actionCodeSettings = {
            url: buildVendorPortalUrl(cleanEmail, {
                orgId: session?.orgId,
                contractorId,
                siteId,
                bootstrap
            }),
            handleCodeInApp: false
        };

        await sendPasswordResetEmail(auth, cleanEmail, actionCodeSettings);
        return {
            portalUrl: buildVendorPortalUrl(cleanEmail, {
                orgId: session?.orgId,
                contractorId,
                siteId,
                bootstrap
            }),
            sentAt: new Date().toISOString()
        };
    };

    const deleteVendor = async () => {
        if (!isGlobalUser) {
            alert('Only the Global Owner can delete vendor records.');
            return;
        }
        if (!activeVendor?.firebaseKey) {
            alert('Vendor profile is not loaded.');
            return;
        }

        const companyName = activeVendor.companyName || 'this vendor';
        const confirmed = window.confirm(
            `Delete ${companyName} from the contractor register?\n\nThis removes the vendor master record immediately. Historical PTW, incidents, and training references will stay for traceability, and the linked vendor portal access will be deactivated.`
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const deletedAt = new Date().toISOString();
            const deletedBy = session.email || session.name || 'Global Owner';

            if (activeVendor.portalUid) {
                const linkedUser = orgUsers.find((user) => user.firebaseKey === activeVendor.portalUid);
                const sharedPortalIdentity = Boolean(activeVendor.portalSharedIdentity || linkedUser?.portalSharedIdentity);
                const linkedUserUpdates = sharedPortalIdentity
                    ? {
                        vendorPortal: false,
                        portalLinkedContractorId: '',
                        portalSharedIdentity: false,
                        updatedAt: deletedAt,
                        updatedBy: deletedBy
                    }
                    : {
                        status: 'Deleted',
                        vendorPortal: false,
                        portalLinkedContractorId: '',
                        portalSharedIdentity: false,
                        deletedAt,
                        deletedBy
                    };

                await dbUpdate(`organizations/${session.orgId}/users/${activeVendor.portalUid}`, linkedUserUpdates);

                setOrgUsers((prev) => prev.map((user) => (
                    user.firebaseKey === activeVendor.portalUid
                        ? {
                            ...user,
                            ...linkedUserUpdates
                        }
                        : user
                )));
            }

            await dbRemove(`organizations/${session.orgId}/contractors/${activeVendor.firebaseKey}`);

            setContractors((prev) => prev.filter((contractor) => contractor.firebaseKey !== activeVendor.firebaseKey));
            writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'contractor.deleted', module: 'Contractors', collection: 'contractors', recordId: activeVendor.firebaseKey, recordTitle: activeVendor.companyName || '', siteId: activeVendor.siteId }));
            setActiveVendor(null);
            setEditingVendor(null);
            setModalType(null);
            alert('Vendor deleted and portal access deactivated successfully.');
        } catch (error) {
            alert(`Failed to delete vendor: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleWorkerCoreDocUpload = async (type, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            const snap = await dbGet(`organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
        if (!snap) return;
        const vendorData = snap;

            const updatedWorkers = safeArr(snap.workers).map((worker) => {
                if (worker.id !== activeWorker.id) return worker;
                const updatedWorker = { ...worker };
                if (type === 'med') {
                    updatedWorker.medDoc = base64;
                    updatedWorker.medDocName = file.name;
                }
                if (type === 'comp') {
                    updatedWorker.compDoc = base64;
                    updatedWorker.compDocName = file.name;
                }
                return updatedWorker;
            });

            await dbUpdate(
                `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`,
                { workers: updatedWorkers }
            );
            await refreshContractors();

            setActiveWorker((prev) => {
                const updated = { ...prev };
                if (type === 'med') {
                    updated.medDoc = base64;
                    updated.medDocName = file.name;
                }
                if (type === 'comp') {
                    updated.compDoc = base64;
                    updated.compDocName = file.name;
                }
                return updated;
            });
        } catch {
            alert('Failed to process document.');
        }
    };

    const requestAdditionalWorkerDoc = async () => {
        if (!newWorkerDocReq) return;

        const newDoc = { id: Date.now().toString(), name: newWorkerDocReq, status: 'Requested', file: null };
        const snap = await dbGet(`organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
        if (!snap) return;
        const vendorData = snap;

        const updatedWorkers = safeArr(snap.workers).map((worker) => (
            worker.id === activeWorker.id ? { ...worker, additionalDocs: [...safeArr(worker.additionalDocs), newDoc] } : worker
        ));

        await dbUpdate(
            `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`,
            { workers: updatedWorkers }
        );
        await refreshContractors();
        setActiveWorker((prev) => ({ ...prev, additionalDocs: [...safeArr(prev.additionalDocs), newDoc] }));
        setNewWorkerDocReq('');
    };

    const uploadAdditionalWorkerDoc = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            const snap = await dbGet(`organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
        if (!snap) return;
        const vendorData = snap;

            const updatedWorkers = safeArr(snap.workers).map((worker) => {
                if (worker.id !== activeWorker.id) return worker;
                return {
                    ...worker,
                    additionalDocs: safeArr(worker.additionalDocs).map((doc) => (
                        doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
                    ))
                };
            });

            await dbUpdate(
                `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`,
                { workers: updatedWorkers }
            );
            await refreshContractors();
            setActiveWorker((prev) => ({
                ...prev,
                additionalDocs: safeArr(prev.additionalDocs).map((doc) => (
                    doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
                ))
            }));
        } catch {
            alert('Upload failed.');
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase">
                <div className="w-8 h-8 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin mr-3"></div>
                Loading Contractors...
            </div>
        );
    }

    return (
        <>
            <style>
                {`
                    @media print {
                        body, html, #root { height: auto !important; overflow: visible !important; background-color: white !important; color: black !important; }
                        .print-content { position: relative !important; width: 100% !important; height: auto !important; overflow: visible !important; display: block !important; }
                    }
                `}
            </style>

            <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible print:bg-white print:text-black">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0 print:hidden"></div>

                <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0 print:hidden">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-hard-hat"></i></div>
                        <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Contractor Safety</h1>
                    </div>
                    <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1 overflow-x-auto custom-scroll">
                        {/* Register Vendor tab removed — vendors self-register
                            via /login (Account Type = Vendor) and are
                            approved from the Users page. */}
                        <button type="button" onClick={() => setView('companies')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'companies' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-building mr-1"></i> Company Profiles</button>
                        <button type="button" onClick={() => setView('workers')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'workers' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-id-badge mr-1"></i> Worker Profiles</button>
                        <button type="button" onClick={() => setView('deployments')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'deployments' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-map-marker-alt mr-1"></i> Deployments</button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full print:hidden">
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
                        {view !== 'register' && (
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{view === 'companies' ? 'Vendor Master Data' : view === 'deployments' ? 'Site Deployments Dashboard' : 'Contractor Personnel Registry'}</h2>
                                    <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">ISO 45001 Compliance Tracking</p>
                                </div>
                                <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                                    <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner w-full md:w-auto">
                                        <option value="All">All Regions</option>
                                        {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                                    </select>
                                    <select value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); sessionStorage.setItem('isoCurrentSite', event.target.value === 'All' ? 'GLOBAL' : event.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner w-full md:w-auto">
                                        {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {filteredVisibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* The register view (ContractorBuilder) was removed —
                            vendors self-register via /login. */}

                        {view === 'companies' && (
                            <ContractorRegistry
                                contractors={visibleContractors}
                                getComplianceStatus={getComplianceStatus}
                                onViewProfile={(vendor) => {
                                    setActiveVendor(vendor);
                                    setModalType('company_profile');
                                }}
                            />
                        )}

                        {view === 'workers' && (
                            <WorkersView
                                allWorkers={allWorkers}
                                canEdit={canEdit}
                                contractors={visibleContractors}
                                onAddWorker={() => setModalType('add_worker')}
                                onViewWorker={(worker) => {
                                    setActiveWorker(worker);
                                    setModalType('worker_profile');
                                }}
                                setWorkerCompanyFilter={setWorkerCompanyFilter}
                                workerCompanyFilter={workerCompanyFilter}
                            />
                        )}

                        {view === 'deployments' && (
                            <DeploymentsView
                                canEdit={canEdit}
                                contractors={visibleContractors}
                                deploymentCompanyFilter={deploymentCompanyFilter}
                                quickUpdateWorkerDeployment={quickUpdateWorkerDeployment}
                                setDeploymentCompanyFilter={setDeploymentCompanyFilter}
                            />
                        )}
                    </div>
                </main>

                {modalType === 'add_worker' && (
                    <AddWorkerModal
                        addWorkerData={addWorkerData}
                        contractors={contractors}
                        onClose={() => setModalType(null)}
                        onSubmit={submitNewWorker}
                        setAddWorkerData={setAddWorkerData}
                        visibleContractors={visibleContractors}
                    />
                )}

                {activeVendor && modalType === 'company_profile' && (
                    <CompanyProfileModal
                        activeVendor={activeVendor}
                        canEdit={canEdit}
                        editingVendor={editingVendor}
                        getComplianceStatus={getComplianceStatus}
                        globalIncidents={globalIncidents}
                        globalPermits={globalPermits}
                        isGlobalUser={isGlobalUser}
                        navigate={navigate}
                        newDocReq={newDocReq}
                        onClose={() => {
                            setActiveVendor(null);
                            setModalType(null);
                            setEditingVendor(null);
                        }}
                        onDeleteVendor={deleteVendor}
                        onHandleDocUpload={handleDocUpload}
                        onOpenVendorPortal={() => window.open(buildVendorPortalUrl(activeVendor?.email, {
                            orgId: session?.orgId,
                            contractorId: activeVendor?.firebaseKey,
                            siteId: safeArr(activeVendor?.allocatedSites)[0] || activeVendor?.siteId || ''
                        }), '_blank', 'noopener,noreferrer')}
                        onProvisionVendorPortalAccess={provisionVendorPortalAccess}
                        onRemoveWorker={removeWorkerFromProfile}
                        onRequestAdditionalDoc={requestAdditionalDoc}
                        onSaveCompanyEdit={saveCompanyProfileEdit}
                        portalProvisioning={portalProvisioning}
                        serviceTypes={SERVICE_TYPES}
                        setEditingVendor={setEditingVendor}
                        setNewDocReq={setNewDocReq}
                        visibleSites={visibleSites}
                    />
                )}

                {portalSuccess && (
                    <PortalSuccessModal
                        onClose={() => setPortalSuccess(null)}
                        portalSuccess={portalSuccess}
                        onSendResetEmail={async () => {
                            // Trigger Firebase's built-in password reset email.
                            // After clicking the link the vendor will be bounced
                            // back into the right org (the actionCodeSettings URL
                            // carries the orgId so the DB selector is already
                            // pinned when they land on the portal sign-in page).
                            try {
                                const result = await sendVendorPortalSetupLink({
                                    vendorEmail: portalSuccess.email,
                                    contractorId: portalSuccess.contractorId || '',
                                    siteId: portalSuccess.siteId || '',
                                    bootstrap: false
                                });
                                alert(
                                    `Password-reset email sent to ${portalSuccess.email}.\n\n` +
                                    `• Tell the vendor to check spam / junk if it doesn't arrive in 2 minutes.\n` +
                                    `• Sender is noreply@<project-id>.firebaseapp.com.\n` +
                                    `• The reset link expires in 1 hour.`
                                );
                                return result;
                            } catch (err) {
                                const code = err?.code || '';
                                if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
                                    alert(
                                        'Firebase refused the reset email — the continue URL is not in the Authorized Domains list.\n\n' +
                                        `URL we tried to use: ${window.location.origin}\n\n` +
                                        'Fix: open Firebase Console → Authentication → Settings → Authorized domains and add this site\'s domain (and "localhost" for development). Then retry.'
                                    );
                                } else if (code === 'auth/user-not-found') {
                                    alert('No Firebase Auth account exists for this email yet. Provision the vendor first to create the auth account, then click Send Reset.');
                                } else if (code === 'auth/too-many-requests') {
                                    alert('Too many reset requests for this email. Wait a few minutes and try again.');
                                } else if (code === 'auth/network-request-failed') {
                                    alert('Network error reaching Firebase. Check your internet connection and try again.');
                                } else {
                                    alert('Could not send the reset email: ' + (err?.message || code || 'Unknown error'));
                                }
                                throw err;
                            }
                        }}
                    />
                )}

                {activeWorker && modalType === 'worker_profile' && (
                    <WorkerProfileModal
                        activeWorker={activeWorker}
                        canEdit={canEdit}
                        contractors={contractors}
                        getComplianceStatus={getComplianceStatus}
                        navigate={navigate}
                        newWorkerDocReq={newWorkerDocReq}
                        onClose={() => {
                            setActiveWorker(null);
                            setModalType(null);
                        }}
                        onHandleWorkerCoreDocUpload={handleWorkerCoreDocUpload}
                        onRequestAdditionalWorkerDoc={requestAdditionalWorkerDoc}
                        onUploadAdditionalWorkerDoc={uploadAdditionalWorkerDoc}
                        setNewWorkerDocReq={setNewWorkerDocReq}
                    />
                )}

                {/* Pending vendor-request modal was removed — vendor approvals
                    now live in the Users page (employee + vendor unified flow). */}
            </div>
        </>
    );
}
