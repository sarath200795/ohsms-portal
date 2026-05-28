import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import authService from '../services/auth/index.js';
import { dbGet, dbUpdate } from '../services/db/index.js';
import { compressImageToBase64, base64SizeKB } from '../utils/imageUtils.js';
import useStore from '../store/useStore';
import { clearFieldModuleHomeContext } from './FieldApp/portalAuth';
import { useAppTransition } from '../hooks/useAppTransition';
import { hasAccessibleModule, isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession, writeStoredSession } from '../utils/session';
import { saveOrgToRegistry } from '../utils/orgRegistry.js';
import { useReminders } from '../hooks/useReminders';
import { parseDate, classifySeverity, daysUntil, formatDueLabel, SEVERITY } from '../utils/reminders';
import { rtdbRest, isFirebaseRestAvailable } from '../utils/rtdbRest.js';
import NeedsAttentionPanel from '../components/NeedsAttentionPanel';

const getDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const DASHBOARD_ACTIVITY_MODULES = ['Incidents', 'OHS Tools', 'Health Dashboard', 'Inspections', 'Record Emergency', 'Participation', 'CAPA Manager'];

const ALL_MODULES = [
    { id: 'Analytics', label: 'Analytics', icon: 'fa-chart-pie', color: 'text-purple-400', path: '/analytics' },
    { id: 'Tutorials', label: 'Tutorials', icon: 'fa-circle-play', color: 'text-amber-300', path: '/tutorials' },
    { id: 'Activity Calendar', label: 'Activity Calendar', icon: 'fa-calendar-days', color: 'text-cyan-300', path: '/activity-calendar' },
    { id: 'Incidents', label: 'Incidents', icon: 'fa-triangle-exclamation', color: 'text-orange-400', path: '/incidents' },
    { id: 'Risk Assessment', label: 'Risk Assessment', icon: 'fa-shield-virus', color: 'text-red-400', path: '/risk' },
    { id: 'Participation', label: 'Participation', icon: 'fa-comments', color: 'text-teal-400', path: '/consultation' },
    { id: 'Internal Audit', label: 'Internal Audit', icon: 'fa-clipboard-check', color: 'text-emerald-400', path: '/audit' },
    { id: 'CAPA Manager', label: 'CAPA Manager', icon: 'fa-list-check', color: 'text-cyan-400', path: '/capa' },
    { id: 'Training', label: 'Training', icon: 'fa-graduation-cap', color: 'text-yellow-400', path: '/training' },
    { id: 'Improvement', label: 'Improvement', icon: 'fa-chart-line', color: 'text-blue-400', path: '/improvement' },
    { id: 'Record Emergency', label: 'Record Emergency', icon: 'fa-person-running', color: 'text-pink-400', path: '/mock-drill' },
    { id: 'OHS Tools', label: 'OHS Tools', icon: 'fa-toolbox', color: 'text-fuchsia-400', path: '/ohs-tools' },
    { id: 'Contractors', label: 'Contractor Safety', icon: 'fa-hard-hat', color: 'text-indigo-400', path: '/contractors' },
    { id: 'MOC', label: 'Mgmt of Change', icon: 'fa-code-branch', color: 'text-rose-400', path: '/moc' },
    { id: 'Inspections', label: 'Inspections', icon: 'fa-search-location', color: 'text-lime-400', path: '/inspections' },
    { id: 'Users', label: 'Users', icon: 'fa-users-gear', color: 'text-slate-300', path: '/users' },
    { id: 'Sites', label: 'Sites', icon: 'fa-building-shield', color: 'text-slate-300', path: '/sites' }
];

const MODULE_TINT = {
    'text-purple-400':  'rgba(168,85,247,0.13)',
    'text-amber-300':   'rgba(253,230,138,0.10)',
    'text-cyan-300':    'rgba(103,232,249,0.10)',
    'text-orange-400':  'rgba(251,146,60,0.13)',
    'text-red-400':     'rgba(248,113,113,0.11)',
    'text-teal-400':    'rgba(45,212,191,0.10)',
    'text-emerald-400': 'rgba(52,211,153,0.10)',
    'text-cyan-400':    'rgba(34,211,238,0.10)',
    'text-yellow-400':  'rgba(250,204,21,0.10)',
    'text-blue-400':    'rgba(96,165,250,0.10)',
    'text-pink-400':    'rgba(244,114,182,0.10)',
    'text-fuchsia-400': 'rgba(232,121,249,0.10)',
    'text-indigo-400':  'rgba(129,140,248,0.10)',
    'text-rose-400':    'rgba(251,113,133,0.10)',
    'text-lime-400':    'rgba(163,230,53,0.10)',
    'text-slate-300':   'rgba(148,163,184,0.07)',
};

const MODULE_GLOW = {
    'text-purple-400':  'rgba(168,85,247,0.45)',
    'text-amber-300':   'rgba(253,230,138,0.45)',
    'text-cyan-300':    'rgba(103,232,249,0.45)',
    'text-orange-400':  'rgba(251,146,60,0.50)',
    'text-red-400':     'rgba(248,113,113,0.45)',
    'text-teal-400':    'rgba(45,212,191,0.45)',
    'text-emerald-400': 'rgba(52,211,153,0.45)',
    'text-cyan-400':    'rgba(34,211,238,0.45)',
    'text-yellow-400':  'rgba(250,204,21,0.45)',
    'text-blue-400':    'rgba(96,165,250,0.45)',
    'text-pink-400':    'rgba(244,114,182,0.45)',
    'text-fuchsia-400': 'rgba(232,121,249,0.45)',
    'text-indigo-400':  'rgba(129,140,248,0.45)',
    'text-rose-400':    'rgba(251,113,133,0.45)',
    'text-lime-400':    'rgba(163,230,53,0.45)',
    'text-slate-300':   'rgba(148,163,184,0.30)',
};

const NavCard = ({ module, actions = [], onClick, index = 0 }) => {
    const topActions = actions.slice(0, 3);
    const extraCount = actions.length - 3;
    const tint = MODULE_TINT[module.color] || 'rgba(70,215,255,0.08)';
    const glow = MODULE_GLOW[module.color] || 'rgba(70,215,255,0.35)';

    return (
        <button
            type="button"
            onClick={onClick}
            className="command-panel myth-hover group attention-item relative flex min-h-[15rem] w-full flex-col overflow-hidden rounded-[1.9rem] p-6 text-left"
            style={{ animationDelay: `${index * 55}ms`, '--icon-glow-color': glow }}
        >
            <div className="myth-card-glow"></div>

            {/* Module color radial tint — top-left corner */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 h-40 w-52 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle at 12% 12%, ${tint}, transparent 68%)`, opacity: 0.7 }}
            />

            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(249,115,22,0.25)] to-transparent"></div>

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className={`myth-icon-frame flex h-14 w-14 items-center justify-center rounded-[1.25rem] text-2xl transition-all duration-300 group-hover:scale-110 ${module.color}`}>
                        <i className={`fas ${module.icon}`}></i>
                    </div>
                    <div>
                        <p className="myth-kicker">{module.id}</p>
                        <h3 className="mt-2 text-2xl text-[var(--myth-ink)]">{module.label}</h3>
                    </div>
                </div>

                {actions.length > 0 ? (
                    <span className="war-chip !border-[rgba(249,115,22,0.3)] !bg-[rgba(255,247,237,0.95)] !text-[var(--myth-ember)]">
                        {actions.length} active
                    </span>
                ) : (
                    <span className="war-chip !border-[rgba(203,213,225,0.6)] !bg-[rgba(248,250,252,0.9)] !text-[var(--myth-muted)]">standby</span>
                )}
            </div>

            <div className="relative z-10 mt-5 flex-1">
                <p className="max-w-sm text-sm leading-relaxed text-[var(--myth-muted)]">
                    Enter the module workspace, review operational status, and execute assigned actions from the central command deck.
                </p>

                {actions.length > 0 ? (
                    <div className="mt-5 rounded-[1.3rem] border border-[rgba(249,115,22,0.12)] bg-[rgba(255,247,237,0.7)] p-4">
                        <p className="myth-kicker mb-3 text-[10px]">Priority Queue</p>
                        <div className="space-y-2">
                            {topActions.map((act, i) => (
                                <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--myth-ink)]">
                                    <i className="fas fa-diamond mt-1 text-[7px] text-[var(--myth-ember)]"></i>
                                    <span className="block truncate">{act.title}</span>
                                </div>
                            ))}
                            {extraCount > 0 ? (
                                <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--myth-muted)]">
                                    + {extraCount} more pending
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 flex items-center justify-between border-t border-[rgba(249,115,22,0.1)] pt-4">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--myth-muted)]">
                            No queued tasks
                        </span>
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(249,115,22,0.2)] bg-[rgba(255,247,237,0.9)] text-[var(--myth-ember)] transition-all duration-300 group-hover:translate-x-1 group-hover:border-[rgba(249,115,22,0.4)]">
                            <i className="fas fa-arrow-right"></i>
                        </span>
                    </div>
                )}
            </div>
        </button>
    );
};

export default function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const playTransition = useAppTransition();

    useEffect(() => {
        clearFieldModuleHomeContext();
    }, []);
    const { session, initializeSession, clearSession } = useStore();

    const [selectedSite, setSelectedSite] = useState('');
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
    const [isPasswordSaving, setIsPasswordSaving] = useState(false);

    // --- PHASE 2 TARGETED FETCHING STATE ---
    const [localOrgData, setLocalOrgData] = useState(null);
    const [localLoading, setLocalLoading] = useState(true);

    // --- ORG LOGO ---
    const [logoSrc,       setLogoSrc      ] = useState('/we-ehs-logo.jpg');
    const [showLogoModal, setShowLogoModal ] = useState(false);
    const [logoPreview,   setLogoPreview  ] = useState(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoError,     setLogoError    ] = useState('');
    const logoFileRef = useRef(null);

    // Rename organisation
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameValue,     setRenameValue    ] = useState('');
    const [renameLoading,   setRenameLoading  ] = useState(false);
    const [renameError,     setRenameError    ] = useState('');
    const [displayOrgName,  setDisplayOrgName ] = useState(null); // overrides useMemo orgName after a rename
    const { items: reminderItems, summary: reminderSummary, loading: remindersLoading } = useReminders();
    const passwordChangeRequired = Boolean(session?.mustChangePassword);

    useEffect(() => {
        const forcePasswordChange = new URLSearchParams(location.search).get('forcePasswordChange') === '1';
        if (passwordChangeRequired || forcePasswordChange) {
            setIsPasswordModalOpen(true);
        }
    }, [location.search, passwordChangeRequired]);

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) return navigate('/');

        initializeSession(sess);

        const isGlobalAdmin = isGlobalOwnerRole(sess.role);

        let initialSite = sessionStorage.getItem('isoCurrentSite');
        if (!initialSite) initialSite = isGlobalAdmin ? 'GLOBAL' : sess.assignedSite;
        if (!isGlobalAdmin && initialSite === 'GLOBAL') initialSite = sess.assignedSite;

        setSelectedSite(initialSite || 'GLOBAL');
        sessionStorage.setItem('isoCurrentSite', initialSite || 'GLOBAL');

        // --- PHASE 2 TARGETED FETCHING ENGINE ---
        // Only pull the exact tables needed to calculate notifications and site lists.
        //
        // Critical path: use the Firebase RTDB REST API (plain HTTPS) instead of
        // the SDK WebSocket when Firebase is the active adapter.  The WebSocket
        // can hang indefinitely when blocked by CSP, network policy, or a
        // regional database URL that isn't covered by the wildcard.  The REST
        // API has a built-in 15-second AbortController timeout so `finally` is
        // always reached and `localLoading` is always cleared.
        const fetchDashboardData = async () => {
            const orgRef = `organizations/${sess.orgId}`;

            if (isFirebaseRestAvailable()) {
                // ── Fast path: HTTPS REST API (no WebSocket dependency) ──────
                try {
                    const idToken = await authService.getIdToken();
                    const [details, sites, ptwRecords, incidents, permissionRequests] = await Promise.all([
                        rtdbRest.get(`${orgRef}/details`, idToken),
                        rtdbRest.get(`${orgRef}/sites`, idToken),
                        rtdbRest.get(`${orgRef}/ptwRecords`, idToken),
                        rtdbRest.get(`${orgRef}/incidents`, idToken),
                        isGlobalAdmin ? rtdbRest.get(`${orgRef}/permissionRequests`, idToken) : Promise.resolve(null),
                    ]);
                    setLocalOrgData({ details, sites, ptwRecords, incidents, permissionRequests });
                    if (details?.logoBase64) setLogoSrc(details.logoBase64);
                } catch (err) {
                    console.error('[Dashboard] REST fetch error:', err.message);
                    // Leave localOrgData null — dashboard renders with defaults
                } finally {
                    setLocalLoading(false);
                }
                return;
            }

            // ── Fallback: SDK path for non-Firebase REST adapters ────────────
            // Custom REST adapters use HTTP (not WebSocket) so they won't hang.
            try {
                const [details, sites, ptwRecords, incidents, permissionRequests] = await Promise.all([
                    dbGet(`${orgRef}/details`),
                    dbGet(`${orgRef}/sites`),
                    dbGet(`${orgRef}/ptwRecords`),
                    dbGet(`${orgRef}/incidents`),
                    isGlobalAdmin ? dbGet(`${orgRef}/permissionRequests`) : Promise.resolve(null),
                ]);
                setLocalOrgData({ details, sites, ptwRecords, incidents, permissionRequests });
                if (details?.logoBase64) setLogoSrc(details.logoBase64);
            } catch (error) {
                console.error('[Dashboard] SDK fetch error:', error);
            } finally {
                setLocalLoading(false);
            }
        };

        fetchDashboardData();
    }, [navigate, initializeSession]);

    const { orgName, sites, myActions, visibleModules } = useMemo(() => {
        let orgName = 'OHS Portal';
        let parsedSites = [];
        let actions = [];
        let vModules = [];

        if (session && localOrgData) {
            const isGlobalAdmin = isGlobalOwnerRole(session.role);
            const myEmail = session.email?.toLowerCase().trim();
            const myName = session.name?.toLowerCase().trim();
            const checkUserMatch = (val) => val?.toLowerCase().trim() === myEmail || val?.toLowerCase().trim() === myName;

            if (localOrgData.details?.name) orgName = localOrgData.details.name;

            if (localOrgData.sites) {
                const allSites = Object.values(localOrgData.sites);
                if (isGlobalAdmin) {
                    parsedSites = allSites;
                } else {
                    const allowedCodes = new Set([session.assignedSite, ...(session.accessibleSites || [])]);
                    parsedSites = allSites.filter(s => allowedCodes.has(s.code));
                }
            }

            const hasActivityCalendarAccess = isGlobalAdmin || DASHBOARD_ACTIVITY_MODULES.some((moduleId) => hasAccessibleModule(session.accessibleModules, moduleId));

            if (isGlobalAdmin) vModules = ALL_MODULES;
            else {
                vModules = ALL_MODULES.filter((mod) => {
                    if (mod.id === 'Tutorials') return true;
                    if (mod.id === 'Activity Calendar') return hasActivityCalendarAccess;
                    return hasAccessibleModule(session.accessibleModules, mod.id);
                });
            }

            if (localOrgData.ptwRecords) {
                Object.values(localOrgData.ptwRecords).forEach(p => {
                    if (!p) return;
                    // Defensive coercion — early-draft PTW records can be
                    // missing engStatus/prodStatus, and calling .includes()
                    // on undefined was crashing the whole useMemo (silently
                    // — caught at the React boundary — leaving the Action
                    // Queue stuck at 0).
                    const status     = String(p.status     || '');
                    const engStatus  = String(p.engStatus  || '');
                    const prodStatus = String(p.prodStatus || '');
                    const isPending = status === 'Pending Approval' || status === 'Pending Closure';
                    const isMyTurn = (p.engApproverEmail  && checkUserMatch(p.engApproverEmail)  && engStatus.includes('Pending')) ||
                                     (p.prodApproverEmail && checkUserMatch(p.prodApproverEmail) && prodStatus.includes('Pending'));
                    if (isPending && isMyTurn) {
                        actions.push({ title: `Permit Auth: ${p.id || 'PTW'}`, module: 'OHS Tools', path: `/ptw?site=${p.siteId || 'All'}` });
                    }
                });
            }

            // CAPA actions from every source collection that carries them.
            // Surface only items that are overdue OR due in the next 7 days so
            // the Action Queue reflects what needs attention right now.
            const todayForActions = new Date();
            const CAPA_DONE = new Set(['closed', 'completed', 'complete', 'done', 'verified', 'resolved']);
            const isCapaDone = (status) => CAPA_DONE.has(String(status || '').trim().toLowerCase());
            const CAPA_SOURCES = [
                { key: 'incidents', siteFrom: 'incident' },
                { key: 'auditFindings', siteFrom: 'finding' },
                { key: 'mockDrills', siteFrom: 'drill' },
                { key: 'inspectionRecords', siteFrom: 'record' }
            ];

            CAPA_SOURCES.forEach(({ key }) => {
                const collection = localOrgData[key];
                if (!collection) return;
                Object.values(collection).forEach((record) => {
                    if (!record) return;
                    const capas = record.capa || (record.investigation && record.investigation.capa);
                    if (!capas) return;
                    Object.values(capas).forEach((act) => {
                        if (!act || isCapaDone(act.status)) return;
                        if (!checkUserMatch(act.owner || act.own || act.assignedTo)) return;

                        const dueDate = parseDate(act.dueDate || act.due || act.targetDate);
                        const severity = classifySeverity(dueDate, todayForActions, { dueSoonDays: 7, upcomingDays: 30 });
                        // Show overdue + due-within-7-days. Items with no due
                        // date OR due > 7 days out are skipped from the queue.
                        if (severity !== SEVERITY.OVERDUE && severity !== SEVERITY.DUE_SOON) return;

                        const days = daysUntil(dueDate, todayForActions);
                        actions.push({
                            title: act.action || act.act || act.desc || 'Corrective action',
                            module: 'CAPA Manager',
                            path: `/capa?site=${act.siteId || record.siteId || 'All'}`,
                            dueLabel: formatDueLabel({ daysUntil: days }),
                            overdue: severity === SEVERITY.OVERDUE
                        });
                    });
                });
            });

            if (isGlobalAdmin && localOrgData.permissionRequests) {
                Object.values(localOrgData.permissionRequests).forEach(req => {
                    if (req.status === 'Pending') {
                        actions.push({ title: `Access Request: ${req.userName}`, module: 'Users', path: '/users' });
                    }
                });
            }
        }

        // Overdue items first, then due-soonest. Items without a dueLabel
        // (PTW approvals, permission requests) sort to the end inside their
        // overdue bucket.
        actions.sort((a, b) => {
            if (a.overdue && !b.overdue) return -1;
            if (!a.overdue && b.overdue) return 1;
            return 0;
        });

        return { orgName, sites: parsedSites, myActions: actions, visibleModules: vModules };
    }, [localOrgData, session]);

    const handleLogout = async () => {
        await authService.signOut();
        sessionStorage.clear();
        clearSession();
        navigate('/');
    };

    const closePasswordModal = () => {
        if (passwordChangeRequired) return;
        if (isPasswordSaving) return;
        setIsPasswordModalOpen(false);
        setPasswordForm({ current: '', next: '', confirm: '' });
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();

        const currentAuthUser = authService.getCurrentUser();
        const userEmail = currentAuthUser?.email || session?.email;

        if (!currentAuthUser || !userEmail) {
            alert('Your secure login session is not ready. Please sign out and sign in again before changing the password.');
            return;
        }

        if (passwordForm.next.length < 6) {
            alert('New password must be at least 6 characters.');
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
            await authService.reauthenticate(userEmail, passwordForm.current);
            await authService.updatePassword(passwordForm.next);
            const passwordUpdatedAt = new Date().toISOString();
            if (session?.orgId && currentAuthUser.uid) {
                await dbUpdate(`organizations/${session.orgId}/userPasswordState/${currentAuthUser.uid}`, {
                    mustChangePassword: false,
                    temporaryPasswordIssued: false,
                    temporaryPasswordIssuedAt: '',
                    passwordUpdatedAt
                });
            }

            const nextSession = writeStoredSession({
                ...session,
                mustChangePassword: false,
                temporaryPasswordIssued: false,
                temporaryPasswordIssuedAt: '',
                passwordUpdatedAt
            });
            initializeSession(nextSession);
            alert('Password changed successfully. Please use the new password from your next login.');
            setIsPasswordModalOpen(false);
            setPasswordForm({ current: '', next: '', confirm: '' });
            if (new URLSearchParams(location.search).get('forcePasswordChange') === '1') {
                navigate('/dashboard', { replace: true });
            }
        } catch (error) {
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                alert('Current password is incorrect. Please try again.');
            } else if (error.code === 'auth/weak-password') {
                alert('New password is too weak. Use at least 6 characters.');
            } else if (error.code === 'auth/requires-recent-login') {
                alert('Please sign out and sign in again before changing your password.');
            } else {
                alert(`Password change failed: ${error.message}`);
            }
        } finally {
            setIsPasswordSaving(false);
        }
    };

    const handleSiteChange = (e) => {
        const newSite = e.target.value;
        setSelectedSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite);
    };

    /* ── ORG LOGO HANDLERS ─────────────────────────────────────────── */
    const handleLogoFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoError('');
        try {
            const dataUrl = await compressImageToBase64(file, 256, 0.85);
            const sizeKb = base64SizeKB(dataUrl);
            if (sizeKb > 200) {
                setLogoError(`Image is still too large after compression (${sizeKb} KB). Please choose a smaller image.`);
                return;
            }
            setLogoPreview(dataUrl);
        } catch (err) {
            setLogoError(err.message);
        }
    };

    const handleLogoSave = async () => {
        if (!logoPreview || !session?.orgId) return;
        setLogoUploading(true);
        setLogoError('');
        try {
            await dbUpdate(`organizations/${session.orgId}/details`, { logoBase64: logoPreview });
            setLogoSrc(logoPreview);
            setLogoPreview(null);
            setShowLogoModal(false);
            if (logoFileRef.current) logoFileRef.current.value = '';
        } catch {
            setLogoError('Failed to save logo. Please try again.');
        } finally {
            setLogoUploading(false);
        }
    };

    const handleLogoRemove = async () => {
        if (!session?.orgId) return;
        setLogoUploading(true);
        setLogoError('');
        try {
            await dbUpdate(`organizations/${session.orgId}/details`, { logoBase64: null });
            setLogoSrc('/we-ehs-logo.jpg');
            setLogoPreview(null);
            setShowLogoModal(false);
            if (logoFileRef.current) logoFileRef.current.value = '';
        } catch {
            setLogoError('Failed to remove logo. Please try again.');
        } finally {
            setLogoUploading(false);
        }
    };

    // ── rename organisation ────────────────────────────────────────────────────
    const handleRenameOrg = async () => {
        const newName = renameValue.trim();
        if (!newName) return setRenameError('Organisation name cannot be empty.');
        if (newName.length > 80) return setRenameError('Name must be 80 characters or fewer.');
        if (!session?.orgId) return;
        setRenameLoading(true);
        setRenameError('');
        try {
            await dbUpdate(`organizations/${session.orgId}/details`, { name: newName });
            setDisplayOrgName(newName);
            setShowRenameModal(false);
            // Keep the picker in sync so the new name appears on /login next visit
            try {
                saveOrgToRegistry({
                    orgId:          session.orgId,
                    orgName:        newName,
                    logoBase64:     logoSrc !== '/we-ehs-logo.jpg' ? logoSrc : null,
                    dbAdapter:      localStorage.getItem('ohsms_db_adapter') || 'firebase',
                    firebaseConfig: localStorage.getItem('ohsms_firebase_config') || null,
                    restUrl:        localStorage.getItem('ohsms_rest_base_url') || null,
                });
            } catch (_) {}
        } catch {
            setRenameError('Failed to save. Please try again.');
        } finally {
            setRenameLoading(false);
        }
    };

    const handleNavigation = (mod) => {
        if (passwordChangeRequired) {
            setIsPasswordModalOpen(true);
            return;
        }
        sessionStorage.setItem('isoCurrentSite', selectedSite);
        const paramSite = selectedSite === 'GLOBAL' ? 'All' : selectedSite;
        playTransition({
            label: `Opening ${mod.label}`,
            action: () => navigate(`${mod.path}?site=${paramSite}`)
        });
    };

    if (localLoading) {
        return (
            <div className="myth-shell flex h-screen flex-col items-center justify-center px-6 text-[var(--myth-ink)]">
                <div className="command-panel flex items-center gap-4 rounded-[1.8rem] px-8 py-6">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[rgba(249,115,22,0.15)] border-t-[var(--myth-ember)]"></div>
                    <div>
                        <p className="myth-kicker">Loading</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--myth-ink)]">Loading Workspace</p>
                    </div>
                </div>
            </div>
        );
    }

    const firstName = session?.name?.split(' ')[0] || 'Team Member';
    const isGlobalAdmin = isGlobalOwnerRole(session?.role);
    const activeSiteName = selectedSite === 'GLOBAL' ? 'Global View (All Sites)' : (sites.find(s => s.code === selectedSite)?.name || selectedSite);
    const hasFieldAppAccess = isGlobalAdmin || visibleModules.some((module) => ['Incidents', 'Inspections', 'OHS Tools', 'Record Emergency'].includes(module.id));
    const greeting = getDayGreeting();

    return (
        <div className="myth-shell relative flex h-screen flex-col overflow-hidden text-[var(--myth-ink)]">

            {/* FLOATING ACTION BUTTON */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
                {isFabOpen && (
                    <div className="flex flex-col items-end gap-3 mb-2">
                    {visibleModules.find(m => m.id === 'Incidents') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening Incidents',
                                action: () => navigate('/incidents?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="fab-item-enter flex items-center gap-3" style={{ animationDelay: '0ms' }}>
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Report Incident</span>
                            <div className="myth-button myth-button-primary flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-[0_0_18px_rgba(247,146,51,0.5)]"><i className="fas fa-triangle-exclamation"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'Inspections') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening Inspections',
                                action: () => navigate('/inspections?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="fab-item-enter flex items-center gap-3" style={{ animationDelay: '55ms' }}>
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Start Inspection</span>
                            <div className="myth-button myth-button-cyan flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-[0_0_18px_rgba(70,215,255,0.45)]"><i className="fas fa-search-location"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'OHS Tools') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening OHS Tools',
                                action: () => navigate('/ohs-tools?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="fab-item-enter flex items-center gap-3" style={{ animationDelay: '110ms' }}>
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Safety Tools</span>
                            <div className="myth-outline-button flex h-12 w-12 items-center justify-center rounded-full text-lg text-[var(--myth-gold)]"><i className="fas fa-toolbox"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'CAPA Manager') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening CAPA Manager',
                                action: () => navigate('/capa?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="fab-item-enter flex items-center gap-3" style={{ animationDelay: '165ms' }}>
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Action Register</span>
                            <div className="myth-outline-button flex h-12 w-12 items-center justify-center rounded-full text-lg text-[var(--myth-cyan)]"><i className="fas fa-list-check"></i></div>
                        </button>
                    )}
                    </div>
                )}

                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    className={`myth-button myth-button-primary flex h-14 w-14 items-center justify-center rounded-full text-xl transition-all duration-300 shadow-[0_0_24px_rgba(247,146,51,0.55)] ${isFabOpen ? 'rotate-45 scale-110' : 'scale-100'}`}>
                    <i className={`fas ${isFabOpen ? 'fa-plus' : 'fa-bolt'}`}></i>
                </button>
            </div>

            <header className="myth-topbar z-40 px-4 sm:px-6">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {/* ── ORG LOGO — click = home; camera overlay = upload (Global Owner only) ── */}
                        <div className="group relative">
                            <button
                                type="button"
                                onClick={() => navigate('/dashboard')}
                                className="myth-icon-frame flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.1rem] focus:outline-none"
                                title="Go to dashboard"
                            >
                                <img src={logoSrc} alt="Org Logo" className="h-full w-full object-cover" />
                            </button>
                            {isGlobalAdmin && (
                                <button
                                    type="button"
                                    onClick={() => { setLogoError(''); setLogoPreview(null); setShowLogoModal(true); }}
                                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--myth-ember)] text-[8px] text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
                                    title="Upload organisation logo"
                                >
                                    <i className="fas fa-camera"></i>
                                </button>
                            )}
                        </div>
                        <div>
                            <p className="myth-kicker">Enterprise Command</p>
                            <div className="group/rename flex items-center gap-2">
                                <h1 className="text-3xl text-[var(--myth-ink)]">{displayOrgName ?? orgName}</h1>
                                {isGlobalAdmin && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRenameValue(displayOrgName ?? orgName);
                                            setRenameError('');
                                            setShowRenameModal(true);
                                        }}
                                        className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-[var(--myth-muted)] opacity-0 transition-opacity hover:bg-orange-100 hover:text-[var(--myth-ember)] group-hover/rename:opacity-100"
                                        title="Rename organisation"
                                    >
                                        <i className="fas fa-pencil"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="myth-surface-soft ml-2 hidden items-center gap-2 rounded-2xl px-4 py-3 lg:flex">
                            <i className="fas fa-location-dot text-[var(--myth-cyan)]"></i>
                            <select
                                value={selectedSite}
                                onChange={handleSiteChange}
                                className="w-44 cursor-pointer bg-transparent text-sm font-bold text-[var(--myth-ink)] outline-none"
                            >
                                {isGlobalAdmin && <option value="GLOBAL">Global View (All Sites)</option>}
                                {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsNotificationOpen(true)} className="myth-outline-button relative flex h-11 w-11 items-center justify-center rounded-2xl">
                            <i className="fas fa-bell text-[var(--myth-gold)]"></i>
                            {myActions.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--myth-ember)] px-1 text-[10px] font-bold text-[#140e08]">{myActions.length}</span>}
                        </button>
                        <div className="myth-surface-soft hidden rounded-2xl px-4 py-2 text-right md:block">
                            <p className="text-sm font-bold text-[var(--myth-ink)]">{session?.name || session?.email}</p>
                            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--myth-ember)]">{session?.role}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsPasswordModalOpen(true)}
                            className="myth-outline-button flex h-11 w-11 items-center justify-center rounded-2xl"
                            title="Change Password"
                            aria-label="Change Password"
                        >
                            <i className="fas fa-key text-[var(--myth-cyan)]"></i>
                        </button>
                        <button onClick={handleLogout} className="myth-button myth-button-danger flex h-11 w-11 items-center justify-center rounded-2xl text-sm"><i className="fas fa-power-off"></i></button>
                    </div>
                </div>
            </header>

            <main className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
                <div className="mx-auto max-w-7xl pb-24">
                    <section className="hero-banner relative mb-10 overflow-hidden rounded-[2.4rem] p-6 sm:p-8 lg:p-10">
                        <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                        <div className="absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_center,rgba(119,195,214,0.12),transparent_65%)] lg:block"></div>
                        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
                            <div>
                                <p className="hud-chip mb-4">Command Deck</p>
                                <h2 className="myth-section-title text-5xl leading-none text-white sm:text-6xl">
                                    {greeting}, {firstName}
                                </h2>
                                <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--myth-muted)] sm:text-lg">
                                    Orchestrate incidents, permits, audits, training, and field execution from a tactical workspace built for live operational control.
                                </p>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    <div className="myth-surface-soft flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm">
                                        <span className="live-pulse" aria-hidden="true" />
                                        <span className="text-[var(--myth-muted)]">Shift Status:</span>{' '}
                                        <strong className="text-[var(--myth-ink)]">{greeting} operations check active</strong>
                                    </div>
                                    <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm">
                                        <span className="text-[var(--myth-muted)]">Organization:</span>{' '}
                                        <strong className="text-[var(--myth-ink)]">{orgName}</strong>
                                    </div>
                                    <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm">
                                        <span className="text-[var(--myth-muted)]">Site Context:</span>{' '}
                                        <strong className="text-[var(--myth-ember)]">{activeSiteName}</strong>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    {myActions.length > 0 ? (
                                        <button type="button" onClick={() => setIsNotificationOpen(true)} className="myth-button myth-button-primary px-5 py-3 text-xs">
                                            {myActions.length} action{myActions.length > 1 ? 's' : ''} required
                                        </button>
                                    ) : (
                                        <span className="war-chip !bg-[rgba(240,253,244,0.95)] !text-[#16a34a] !border-[rgba(34,197,94,0.3)]">
                                            All systems clear
                                        </span>
                                    )}

                                    {hasFieldAppAccess && (
                                        <button
                                            type="button"
                                            onClick={() => playTransition({
                                                label: 'Opening Field Portal',
                                                action: () => navigate(`/field-portal?site=${selectedSite === 'GLOBAL' ? 'All' : selectedSite}`)
                                            })}
                                            className="myth-button myth-button-cyan px-5 py-3 text-xs"
                                        >
                                            Open Field Portal
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setIsPasswordModalOpen(true)}
                                        className="myth-outline-button px-5 py-3 text-xs"
                                    >
                                        <i className="fas fa-key mr-2 text-[var(--myth-cyan)]"></i>
                                        Change Password
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="myth-stat-card p-5">
                                    <p className="myth-kicker relative z-10">Modules Unlocked</p>
                                    <div className="relative z-10 mt-3 text-5xl font-black text-[var(--myth-ink)] stat-number-pop">{visibleModules.length}</div>
                                    <div className="relative z-10 myth-stat-bar">
                                        <div
                                            className="myth-stat-bar-fill"
                                            style={{ width: `${Math.round((visibleModules.length / ALL_MODULES.length) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="relative z-10 mt-2 text-xs text-[var(--myth-muted)]">{visibleModules.length} of {ALL_MODULES.length} systems active</p>
                                </div>
                                <div className="myth-stat-card p-5">
                                    <p className="myth-kicker relative z-10">Action Queue</p>
                                    <div className={`relative z-10 mt-3 text-5xl font-black stat-number-pop ${myActions.length > 0 ? 'text-[var(--myth-ember)]' : 'text-[var(--myth-ink)]'}`}>{myActions.length}</div>
                                    <div className="relative z-10 myth-stat-bar">
                                        <div
                                            className="myth-stat-bar-fill"
                                            style={{
                                                width: `${Math.min((myActions.length / 10) * 100, 100)}%`,
                                                background: myActions.length > 0
                                                    ? 'linear-gradient(90deg, #f79233, #ef4444)'
                                                    : 'linear-gradient(90deg, var(--myth-cyan), var(--myth-ember))'
                                            }}
                                        />
                                    </div>
                                    <p className="relative z-10 mt-2 text-xs text-[var(--myth-muted)]">
                                        {myActions.length === 0 ? 'All clear — inbox zero' : 'Overdue or due in next 7 days'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mb-6">
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="myth-kicker">Operational Modules</p>
                                <h3 className="text-4xl text-[var(--myth-ink)]">Command Stations</h3>
                                <p className="text-sm text-[var(--myth-muted)]">
                                    Each station opens with your selected site context and live authorization state.
                                </p>
                            </div>

                            <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm text-[var(--myth-muted)] lg:hidden">
                                <label className="mr-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">Site</label>
                                <select
                                    value={selectedSite}
                                    onChange={handleSiteChange}
                                    className="min-w-[180px] bg-transparent font-bold text-[var(--myth-ink)] outline-none"
                                >
                                    {isGlobalAdmin && <option value="GLOBAL">Global View (All Sites)</option>}
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="mb-6">
                            <NeedsAttentionPanel
                                items={reminderItems}
                                summary={reminderSummary}
                                loading={remindersLoading}
                            />
                        </div>

                        {visibleModules.length === 0 ? (
                            <div className="command-panel rounded-[2rem] p-10 text-center">
                                <div className="myth-icon-frame mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl text-[var(--myth-muted)]">
                                    <i className="fas fa-lock"></i>
                                </div>
                                <p className="myth-kicker">Access Gate</p>
                                <h4 className="mt-3 text-3xl text-[var(--myth-ink)]">No Modules Assigned</h4>
                                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--myth-muted)]">
                                    Your account is active, but no operational systems have been assigned yet. Request access to unlock the relevant command stations.
                                </p>
                                <button type="button" onClick={() => navigate('/users')} className="myth-button myth-button-primary mt-6 px-6 py-3 text-xs">
                                    Request Access
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                {visibleModules.map((mod, idx) => {
                                    const modActions = myActions.filter(a => a.module === mod.id);
                                    return <NavCard key={mod.id} module={mod} actions={modActions} onClick={() => handleNavigation(mod)} index={idx} />;
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {isNotificationOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setIsNotificationOpen(false)}></div>
                    <div className="command-panel relative flex h-full w-80 flex-col border-l border-[rgba(242,201,120,0.14)] md:w-[26rem]">
                        <div className="flex items-center justify-between border-b border-[rgba(242,201,120,0.1)] px-6 py-5">
                            <div>
                                <p className="myth-kicker">Action Center</p>
                                <h2 className="mt-1 text-3xl text-[var(--myth-ink)]">Priority Inbox</h2>
                            </div>
                            <button onClick={() => setIsNotificationOpen(false)} className="myth-outline-button flex h-10 w-10 items-center justify-center rounded-full"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                            {myActions.map((act, i) => (
                                <button
                                    type="button"
                                    key={i}
                                    onClick={() => { setIsNotificationOpen(false); navigate(act.path); }}
                                    className="command-panel myth-hover w-full rounded-[1.5rem] p-4 text-left"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="myth-kicker text-[10px]">{act.module}</p>
                                        {act.dueLabel && (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                                                style={{
                                                    backgroundColor: act.overdue ? '#fef2f2' : '#fffbeb',
                                                    color: act.overdue ? '#b91c1c' : '#b45309',
                                                    border: `1px solid ${act.overdue ? '#fecaca' : '#fde68a'}`
                                                }}
                                            >
                                                <i className={`fas ${act.overdue ? 'fa-circle-exclamation' : 'fa-clock'}`}></i>
                                                {act.dueLabel}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold leading-snug text-[var(--myth-ink)]">{act.title}</p>
                                        <i className="fas fa-arrow-right mt-1 text-[var(--myth-ember)]"></i>
                                    </div>
                                </button>
                            ))}
                            {myActions.length === 0 && (
                                <div className="flex h-full flex-col items-center justify-center text-center">
                                    <div className="myth-icon-frame mb-5 flex h-16 w-16 items-center justify-center rounded-full text-[var(--myth-gold)]">
                                        <i className="fas fa-shield-check text-2xl"></i>
                                    </div>
                                    <p className="myth-kicker">Inbox Zero</p>
                                    <p className="mt-2 text-sm text-[var(--myth-muted)]">No pending actions required.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── LOGO UPLOAD MODAL (Global Owner only) ─────────────────── */}
            {showLogoModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => { if (!logoUploading) setShowLogoModal(false); }}></div>
                    <div className="command-panel relative w-full max-w-sm rounded-[2rem] p-6">
                        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[rgba(242,201,120,0.1)] pb-5">
                            <div>
                                <p className="myth-kicker">Organisation Branding</p>
                                <h2 className="mt-1 text-3xl text-[var(--myth-ink)]">Upload Logo</h2>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--myth-muted)]">
                                    Replaces the default logo across the entire workspace. Max 256 × 256 px, JPEG compressed.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { if (!logoUploading) setShowLogoModal(false); }}
                                disabled={logoUploading}
                                className="myth-outline-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Preview area */}
                        <div className="mb-5 flex flex-col items-center gap-4">
                            <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.4rem] border-2 border-dashed border-slate-300 bg-slate-100">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Preview" className="h-full w-full object-cover" />
                                ) : (
                                    <img src={logoSrc} alt="Current Logo" className="h-full w-full object-cover opacity-60" />
                                )}
                                {logoPreview && (
                                    <span className="absolute bottom-1 right-1 rounded-md bg-[var(--myth-ember)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#140e08]">
                                        New
                                    </span>
                                )}
                            </div>
                            <p className="text-center text-xs text-[var(--myth-muted)]">
                                {logoPreview
                                    ? `Preview ready — ${base64SizeKB(logoPreview)} KB`
                                    : logoSrc !== '/we-ehs-logo.jpg'
                                        ? 'Current custom logo shown'
                                        : 'No custom logo set'}
                            </p>
                        </div>

                        {/* File input */}
                        <label className="mb-4 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-orange-400 hover:bg-orange-50">
                            <i className="fas fa-cloud-arrow-up text-[var(--myth-gold)]"></i>
                            <span className="text-sm text-[var(--myth-ink)]">
                                {logoPreview ? 'Choose a different image' : 'Choose image file…'}
                            </span>
                            <input
                                ref={logoFileRef}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={handleLogoFileChange}
                                disabled={logoUploading}
                            />
                        </label>

                        {logoError && (
                            <p className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-600">
                                <i className="fas fa-circle-exclamation mr-2"></i>{logoError}
                            </p>
                        )}

                        <div className="flex gap-3">
                            {logoSrc !== '/we-ehs-logo.jpg' && !logoPreview && (
                                <button
                                    type="button"
                                    onClick={handleLogoRemove}
                                    disabled={logoUploading}
                                    className="myth-button myth-button-danger flex-1 py-3 text-xs disabled:opacity-50"
                                >
                                    {logoUploading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-trash-can mr-2"></i>Remove Logo</>}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleLogoSave}
                                disabled={!logoPreview || logoUploading}
                                className="myth-button myth-button-primary flex-1 py-3 text-xs disabled:opacity-50"
                            >
                                {logoUploading ? (
                                    <><i className="fas fa-spinner fa-spin mr-2"></i>Saving…</>
                                ) : (
                                    <><i className="fas fa-floppy-disk mr-2"></i>Save Logo</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── RENAME ORGANISATION MODAL ── */}
            {showRenameModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                        onClick={() => { if (!renameLoading) setShowRenameModal(false); }}
                    />
                    <div className="command-panel relative w-full max-w-md rounded-[2rem] p-6">
                        {/* Header */}
                        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[rgba(242,201,120,0.1)] pb-5">
                            <div>
                                <p className="myth-kicker">Organisation Settings</p>
                                <h2 className="mt-1 text-3xl text-[var(--myth-ink)]">Rename Organisation</h2>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--myth-muted)]">
                                    Updates the name shown across the dashboard and login screen.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { if (!renameLoading) setShowRenameModal(false); }}
                                disabled={renameLoading}
                                className="myth-outline-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Input */}
                        <div className="mb-2">
                            <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">
                                Organisation Name
                            </label>
                            <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !renameLoading) handleRenameOrg();
                                    if (e.key === 'Escape') setShowRenameModal(false);
                                }}
                                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition"
                                placeholder="Enter organisation name"
                                maxLength={80}
                                autoFocus
                                disabled={renameLoading}
                            />
                            <p className="mt-1 text-right text-[10px] text-[var(--myth-muted)]">
                                {renameValue.length} / 80
                            </p>
                        </div>

                        {renameError && (
                            <p className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-600">
                                <i className="fas fa-circle-exclamation mr-2"></i>{renameError}
                            </p>
                        )}

                        {/* Actions */}
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowRenameModal(false)}
                                disabled={renameLoading}
                                className="myth-button myth-button-secondary flex-1 py-3 text-sm disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRenameOrg}
                                disabled={renameLoading || !renameValue.trim()}
                                className="myth-button myth-button-primary flex-1 py-3 text-sm disabled:opacity-50"
                            >
                                {renameLoading
                                    ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving…</>
                                    : <><i className="fas fa-floppy-disk mr-2"></i>Save Name</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={closePasswordModal}></div>
                    <form onSubmit={handleChangePassword} className="command-panel relative w-full max-w-md rounded-[2rem] p-6">
                        <div className="mb-6 flex items-start justify-between gap-4 border-b border-[rgba(242,201,120,0.1)] pb-5">
                            <div>
                                <p className="myth-kicker">Account Security</p>
                                <h2 className="mt-1 text-3xl text-[var(--myth-ink)]">{passwordChangeRequired ? 'Password Update Required' : 'Change Password'}</h2>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--myth-muted)]">
                                    {passwordChangeRequired
                                        ? 'This account was provisioned with a temporary password. Update it now before using the enterprise workspace.'
                                        : 'Confirm your current password, then set a new secure password for this account.'}
                                </p>
                            </div>
                            {!passwordChangeRequired && (
                                <button
                                    type="button"
                                    onClick={closePasswordModal}
                                    disabled={isPasswordSaving}
                                    className="myth-outline-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                                    aria-label="Close change password"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="myth-kicker mb-2 block text-[10px]" htmlFor="current-password">Current Password</label>
                                <input
                                    id="current-password"
                                    type="password"
                                    value={passwordForm.current}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, current: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[var(--myth-ink)] outline-none transition focus:border-[var(--myth-ember)]"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>

                            <div>
                                <label className="myth-kicker mb-2 block text-[10px]" htmlFor="new-password">New Password</label>
                                <input
                                    id="new-password"
                                    type="password"
                                    value={passwordForm.next}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, next: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[var(--myth-ink)] outline-none transition focus:border-[var(--myth-ember)]"
                                    autoComplete="new-password"
                                    minLength={6}
                                    required
                                />
                                <p className="mt-2 text-[11px] text-[var(--myth-muted)]">Use at least 6 characters. Longer passwords are recommended.</p>
                            </div>

                            <div>
                                <label className="myth-kicker mb-2 block text-[10px]" htmlFor="confirm-password">Confirm New Password</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    value={passwordForm.confirm}
                                    onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[var(--myth-ink)] outline-none transition focus:border-[var(--myth-ember)]"
                                    autoComplete="new-password"
                                    minLength={6}
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 border-t border-[rgba(242,201,120,0.1)] pt-5">
                            {!passwordChangeRequired && (
                                <button
                                    type="button"
                                    onClick={closePasswordModal}
                                    disabled={isPasswordSaving}
                                    className="myth-outline-button px-5 py-3 text-xs disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isPasswordSaving}
                                className="myth-button myth-button-primary px-6 py-3 text-xs disabled:opacity-50"
                            >
                                {isPasswordSaving ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Updating
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-shield-halved mr-2"></i>
                                        Update Password
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
