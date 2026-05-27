/**
 * Login.jsx  (route: "/login")
 *
 * Two modes only:
 *   login — Sign in to an existing organisation
 *   join  — Request access to an existing organisation with a join code
 *
 * "Create Organisation" has been moved to the landing page (/).
 *
 * On login the app:
 *   1. Verifies the database is reachable
 *   2. Authenticates via authService (Firebase or REST/JWT)
 *   3. Looks up the user's org via userDirectory/{uid}
 *   4. Loads full user record + password state from the org
 *   5. Writes a session and navigates to /dashboard
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/auth/index.js';
import { dbGet, dbSet } from '../services/db/index.js';
import { normalizeSessionPermissions } from '../utils/permissions';
import {
    ACCOUNT_STATUS,
    canAuthenticateStatus,
    isDeletedStatus,
    isPendingStatus,
    writeStoredSession,
} from '../utils/session';
import {
    getOrgRegistry,
    saveOrgToRegistry,
    applyOrgDbConfig,
    isCurrentDb,
    getDbTypeLabel,
} from '../utils/orgRegistry.js';

// ─── static content (preserved from before) ───────────────────────────────────
const FEATURE_HIGHLIGHTS = [
    { title: 'Smart RCA',        icon: 'fa-brain',          text: 'Incident narratives auto-build 5-Why, fishbone, fault tree, CAPA suggestions, and HIRA review links.' },
    { title: 'QR Field Action',  icon: 'fa-qrcode',         text: 'Field teams scan PTW, LOTO, emergency equipment, and inspection tags to open the right workflow instantly.' },
    { title: 'Audit-Ready PDFs', icon: 'fa-file-pdf',       text: 'Generate formal records for incidents, HIRA, inspections, permits, emergency equipment, audits, and training.' },
    { title: 'Connected CAPA',   icon: 'fa-list-check',     text: 'Findings from incidents, audits, drills, inspections, and improvements feed one centralised action tracker.' },
    { title: 'Training Matrix',  icon: 'fa-user-graduate',  text: 'Track competence, expiry, retraining needs, contractor inductions, and CAPA-linked training sessions.' },
    { title: 'Site-Based Control', icon: 'fa-shield-halved', text: 'Role, module, site, vendor, and field-portal access controls keep users focused on approved work.' },
];

const UNIQUE_FEATURES = [
    { label: 'Live Command Hub', value: 'One dashboard for site activity, open CAPA, approvals, and module navigation.' },
    { label: 'Field Portal',     value: 'Separate mobile-friendly portal for QR scanning, inspections, PTW, LOTO, incidents, and emergency equipment.' },
    { label: 'Vendor Portal',    value: 'Controlled contractor area for worker records, documents, incidents, and permit visibility.' },
    { label: 'Activity Calendar', value: 'Daily, weekly, and monthly view of PTW, incidents, health, inspections, drills, meetings, and CAPA.' },
];

const MODULE_DETAILS = [
    { title: 'Incident Management', icon: 'fa-triangle-exclamation', tag: 'RCA + HIRA',      detail: 'Report incidents, build investigation teams, generate smart RCA, assign CAPA, and link to risk assessments.' },
    { title: 'Risk Assessment',     icon: 'fa-shield-virus',         tag: 'HIRA Register',   detail: 'Create task-based HIRA with hazards, controls, risk scoring, ALARP review, revision history, and PDF output.' },
    { title: 'PTW',                  icon: 'fa-file-signature',       tag: 'Permit Control',  detail: 'Manage permit requests, approvals, live inspections, observations, QR access, printouts, and field verification.' },
    { title: 'LOTO',                 icon: 'fa-lock',                 tag: 'Isolation Safety', detail: 'Generate isolation procedures, equipment tags, QR execution pages, verification steps, and procedure reports.' },
    { title: 'Inspections',          icon: 'fa-clipboard-check',      tag: 'Scheduled Checks', detail: 'Assign inspections by date, frequency, site, owner, completion status, CAPA, and PDFs.' },
    { title: 'Emergency Equipment',  icon: 'fa-fire-extinguisher',    tag: 'Asset Readiness', detail: 'Create equipment tags, monthly checklists, missed inspection tracking, next due dates, and printable reports.' },
];

const normalizeJoinCode = (v) => v.toUpperCase().trim().replace(/[^A-Z0-9-]/g, '');

// ─── helpers ───────────────────────────────────────────────────────────────────

/** Return a human-readable label for the currently active database adapter. */
const getDbLabel = () => {
    try {
        const a = localStorage.getItem('ohsms_db_adapter') ||
                  (import.meta.env.VITE_DB_ADAPTER) ||
                  'firebase';
        if (a === 'rest') {
            const url = localStorage.getItem('ohsms_rest_base_url') ||
                        import.meta.env.VITE_API_BASE_URL || '';
            return { type: 'rest', label: url ? `REST: ${url.replace(/https?:\/\//, '').substring(0, 24)}…` : 'REST API', color: 'text-cyan-400' };
        }
        return { type: 'firebase', label: 'Firebase RTDB', color: 'text-orange-400' };
    } catch {
        return { type: 'firebase', label: 'Firebase RTDB', color: 'text-orange-400' };
    }
};

// ─── component ────────────────────────────────────────────────────────────────

export default function Login() {
    const navigate = useNavigate();

    const [authMode, setAuthMode]               = useState('login');
    const [loading,  setLoading]                = useState(false);

    // Sign-in fields
    const [email,    setEmail]                  = useState('');
    const [password, setPassword]               = useState('');
    const [resetEmail, setResetEmail]           = useState('');
    const [showPasswordReset, setShowPasswordReset] = useState(false);

    // Join-org fields
    const [joinCode,     setJoinCode]           = useState('');
    const [userName,     setUserName]           = useState('');
    const [regEmail,     setRegEmail]           = useState('');
    const [regPassword,  setRegPassword]        = useState('');

    // DB status
    const [dbStatus, setDbStatus]               = useState(null); // null | 'ok' | 'error'
    const [dbInfo]                              = useState(() => getDbLabel());

    // Org registry picker
    const [orgRegistry, setOrgRegistry]         = useState([]);
    const [pickedOrg,   setPickedOrg]           = useState(null); // null = show picker when registry has entries

    const isJoinMode = authMode === 'join';

    const resetJoinFields = () => {
        setRegEmail(''); setRegPassword(''); setUserName(''); setJoinCode('');
    };

    // ── org picker ────────────────────────────────────────────────────────────
    const handleOrgPick = (entry) => {
        if (isCurrentDb(entry)) {
            // Same DB already active — just show the login form for this org
            setPickedOrg(entry);
        } else {
            // Different DB — apply the new config, stash the pick, and reload
            // so the Firebase SDK re-initialises with the new credentials.
            applyOrgDbConfig(entry);
            sessionStorage.setItem('ohsms_picked_org', JSON.stringify(entry));
            window.location.reload();
        }
    };

    // ── load org registry + restore pickedOrg after a DB-switch reload ──────────
    useEffect(() => {
        setOrgRegistry(getOrgRegistry());
        const pending = sessionStorage.getItem('ohsms_picked_org');
        if (pending) {
            try { setPickedOrg(JSON.parse(pending)); } catch {}
            sessionStorage.removeItem('ohsms_picked_org');
        }
    }, []);

    // ── pre-flight: verify DB is reachable on mount ────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                if (dbInfo.type === 'firebase') {
                    // ping the auth service — if Firebase initialised, this won't throw
                    const cur = authService.getCurrentUser();
                    if (!cancelled) setDbStatus('ok');
                } else {
                    const url = (localStorage.getItem('ohsms_rest_base_url') || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
                    if (!url) { if (!cancelled) setDbStatus('error'); return; }
                    const res = await fetch(`${url}/health`, {
                        signal: AbortSignal.timeout(5000),
                        headers: { Accept: 'application/json' },
                    }).catch(() => null);
                    if (!cancelled) setDbStatus(res && (res.ok || res.status < 500) ? 'ok' : 'error');
                }
            } catch {
                if (!cancelled) setDbStatus('error');
            }
        };
        check();
        return () => { cancelled = true; };
    }, [dbInfo.type]);

    // ── sign in ────────────────────────────────────────────────────────────────
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Authenticate
            const user = await authService.signIn(email.trim().toLowerCase(), password);

            // 2. Find which organisation this user belongs to
            const userDirData = await dbGet(`userDirectory/${user.uid}`);

            if (!userDirData) {
                await authService.signOut();
                alert(
                    'Account not linked to any organisation.\n\n' +
                    'This usually means the organisation setup did not complete fully. ' +
                    'Please go to the Setup Wizard (/setup) and create your organisation again, ' +
                    'or ask your admin to add your account from User Management.'
                );
                return;
            }

            const userOrgId = userDirData.orgId;

            // 3. Load user record, password state, and org details in parallel
            const [userData, passwordState, orgDetails] = await Promise.all([
                dbGet(`organizations/${userOrgId}/users/${user.uid}`),
                dbGet(`organizations/${userOrgId}/userPasswordState/${user.uid}`),
                dbGet(`organizations/${userOrgId}/details`),
            ]);

            if (!userData) {
                await authService.signOut();
                alert('Your account exists but was removed from the organisation directory. Please contact your admin.');
                return;
            }

            // 4. Check account status
            if (isPendingStatus(userData.status)) {
                await authService.signOut();
                alert('Your account is currently Pending. Please wait for your Organisation Admin to approve your access.');
                return;
            }

            if (!canAuthenticateStatus(userData.status) || isDeletedStatus(userData.status)) {
                await authService.signOut();
                alert('This account has been deactivated. Please contact your administrator.');
                return;
            }

            // 5. Write session and navigate
            const sessionData = normalizeSessionPermissions({
                uid:                user.uid,
                email:              user.email,
                orgId:              userOrgId,
                name:               userData.name || user.email.split('@')[0],
                role:               userData.role || 'User',
                status:             userData.status || ACCOUNT_STATUS.ACTIVE,
                assignedSite:       userData.assignedSite || 'GLOBAL',
                accessibleSites:    userData.accessibleSites || [],
                accessibleModules:  userData.accessibleModules || [],
                mustChangePassword:        passwordState ? Boolean(passwordState.mustChangePassword)        : Boolean(userData.mustChangePassword),
                temporaryPasswordIssued:   passwordState ? Boolean(passwordState.temporaryPasswordIssued)   : Boolean(userData.temporaryPasswordIssued),
                temporaryPasswordIssuedAt: passwordState ? (passwordState.temporaryPasswordIssuedAt || '')  : (userData.temporaryPasswordIssuedAt || ''),
                passwordUpdatedAt:         passwordState ? (passwordState.passwordUpdatedAt || '')           : (userData.passwordUpdatedAt || ''),
            });

            writeStoredSession(sessionData);

            // Auto-register this org in the local picker so it appears as a logo
            // card on /login for all future visits — even for orgs created before
            // the registry existed.  This also refreshes the logo if it changed.
            try {
                saveOrgToRegistry({
                    orgId:          userOrgId,
                    orgName:        orgDetails?.name || userData.name || user.email.split('@')[0],
                    logoBase64:     orgDetails?.logoBase64 || null,
                    dbAdapter:      localStorage.getItem('ohsms_db_adapter') || 'firebase',
                    firebaseConfig: localStorage.getItem('ohsms_firebase_config') || null,
                    restUrl:        localStorage.getItem('ohsms_rest_base_url') || null,
                });
                // Refresh the in-memory registry so the picker updates immediately
                // (in case the user navigates back to /login before the next mount)
                setOrgRegistry(getOrgRegistry());
            } catch (_) { /* never block login for a registry write failure */ }

            navigate(sessionData.mustChangePassword ? '/dashboard?forcePasswordChange=1' : '/dashboard');

        } catch (error) {
            alert(`Login Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── forgot password ────────────────────────────────────────────────────────
    const handleForgotPassword = async () => {
        const targetEmail = (resetEmail || email).trim().toLowerCase();
        if (!targetEmail) return alert('Please enter your email address first.');
        setLoading(true);
        try {
            await authService.sendPasswordReset(targetEmail);
            alert('If an account exists for this email, a password reset link has been sent.');
            setResetEmail('');
        } catch (error) {
            if (error.code === 'auth/invalid-email') {
                alert('Please enter a valid email address.');
            } else {
                alert('If an account exists for this email, a password reset link has been sent.');
            }
        } finally {
            setLoading(false);
        }
    };

    // ── join existing org ──────────────────────────────────────────────────────
    const handleJoinExistingOrg = async (e) => {
        e.preventDefault();
        if (regPassword.length < 6) return alert('Password must be at least 6 characters.');
        const code = normalizeJoinCode(joinCode);
        if (!code) return alert('Please enter the workspace join code provided by your admin.');

        setLoading(true);
        let createdUid = null;
        try {
            const joinEmail = regEmail.trim().toLowerCase();

            // 1. Create Firebase Auth account (REST API — no SDK auth-state side-effects).
            const uid = await authService.register(joinEmail, regPassword);
            createdUid = uid;

            // 2. Sign in to primary auth so DB reads/writes pass security rules (auth != null).
            await authService.signIn(joinEmail, regPassword);

            const existingOrgId = await dbGet(`joinRegistry/${code}`);
            if (!existingOrgId) {
                await authService.deleteUser(uid);
                alert('This join code is invalid or has expired. Please ask your Organisation Admin to generate a fresh code from User Management.');
                return;
            }

            await dbSet(`organizations/${existingOrgId}/users/${uid}`, {
                name:             userName.trim(),
                email:            joinEmail,
                role:             'User',
                assignedSite:     '',
                accessibleSites:  [],
                accessibleModules: [],
                status:           ACCOUNT_STATUS.PENDING,
                joinCode:         code,
                createdAt:        new Date().toISOString(),
            });

            await dbSet(`userDirectory/${uid}`, { orgId: existingOrgId });
            await authService.signOut();

            alert(
                'Access request submitted.\n\n' +
                'Your account is now Pending. Please ask your Organisation Admin to approve your access from User Management.'
            );
            setAuthMode('login');
            resetJoinFields();
        } catch (error) {
            if (createdUid) await authService.deleteUser(createdUid).catch(() => {});
            alert(`Join request failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div className="myth-shell min-h-screen overflow-y-auto px-3 py-4 sm:px-4" style={{ overflowY: 'auto' }}>
            <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_0.72fr]">

                {/* ── HERO BANNER ── */}
                <section className="hero-banner flex flex-col justify-between rounded-[1.5rem] p-5 lg:p-6">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <div>
                        <p className="hud-chip mb-3">Tactical Operations Interface</p>
                        <div className="mb-4 flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="focus:outline-none"
                                title="Go to home page"
                            >
                                <img
                                    src="/we-ehs-logo.jpg"
                                    alt="WE EHS Logo"
                                    className="h-16 w-16 rounded-2xl border border-[var(--myth-border-strong)] object-cover shadow-2xl transition-opacity hover:opacity-80 sm:h-20 sm:w-20"
                                />
                            </button>
                            <div>
                                <p className="legendary-title text-xs text-[var(--myth-cyan)]">WE EHS Safety Tool</p>
                                <h1 className="mt-1 text-4xl text-white sm:text-5xl">Control Safer Operations</h1>
                            </div>
                        </div>
                        <p className="max-w-2xl text-sm leading-relaxed text-[var(--myth-muted)]">
                            A tactical command interface for modern EHS teams — fast navigation, clear priorities,
                            and confident action in live operations. Connects to any database.
                        </p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {UNIQUE_FEATURES.map((f) => (
                            <div key={f.label} className="rounded-xl border border-[var(--myth-border)] bg-black/25 p-3 shadow-inner">
                                <p className="legendary-title text-[9px] text-[var(--myth-cyan)]">{f.label}</p>
                                <p className="mt-1 text-[10px] leading-snug text-[var(--myth-muted)]">{f.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[0.82fr_1.18fr]">
                        <div className="rounded-2xl border border-[var(--myth-border)] bg-black/20 p-3">
                            <p className="legendary-title mb-2 text-[10px] text-[var(--myth-cyan)]">Core Strengths</p>
                            <div className="flex flex-wrap gap-2">
                                {FEATURE_HIGHLIGHTS.map((f) => (
                                    <span key={f.title} className="inline-flex items-center gap-2 rounded-full border border-[var(--myth-border)] bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--myth-muted)]">
                                        <i className={`fas ${f.icon} text-[var(--myth-cyan)]`}></i>
                                        {f.title}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--myth-border)] bg-black/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="legendary-title text-[10px] text-[var(--myth-cyan)]">Key Modules</p>
                                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--myth-muted)]">Connected EHS</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {MODULE_DETAILS.map((m) => (
                                    <div key={m.title} className="rounded-xl border border-[var(--myth-border)] bg-[rgba(8,10,12,0.72)] p-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--myth-border)] bg-black/30 text-[var(--myth-cyan)]">
                                                <i className={`fas ${m.icon}`}></i>
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="truncate text-xs font-black text-white">{m.title}</h3>
                                                <p className="truncate text-[8px] font-black uppercase tracking-[0.14em] text-[var(--myth-cyan)]">{m.tag}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── COMMAND PANEL ── */}
                <section className="command-panel flex flex-col justify-between rounded-[1.5rem] p-5 lg:p-6">

                    {/* ═══════════════════════════════════════════════════════════════
                        ORG / DATABASE PICKER
                        Always shown first — pickedOrg === null means "show picker".
                        Works whether the registry has entries or not.
                    ═══════════════════════════════════════════════════════════════ */}
                    {!pickedOrg ? (
                        <div>
                            <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">
                                {orgRegistry.length > 0 ? 'Connected Organisations' : 'Database Connection'}
                            </p>
                            <h2 className="mt-2 text-3xl text-white">
                                {orgRegistry.length > 0 ? 'Select Your Workspace' : 'Connect Your Database'}
                            </h2>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">
                                {orgRegistry.length > 0
                                    ? 'Click your organisation logo to connect to its database and sign in.'
                                    : 'Set up a database connection first, then create your organisation.'}
                            </p>

                            {/* Active DB status bar */}
                            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <div className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                    dbStatus === 'ok'    ? 'bg-green-400' :
                                    dbStatus === 'error' ? 'animate-pulse bg-red-400' :
                                                          'bg-gray-500'
                                }`} />
                                <span className={`flex-1 truncate text-[10px] font-bold ${dbInfo.color}`}>
                                    {dbStatus === 'ok' ? 'Connected · ' : dbStatus === 'error' ? 'Unreachable · ' : 'Checking · '}
                                    {dbInfo.label}
                                </span>
                                <a href="/setup" className="flex-shrink-0 text-[10px] text-slate-500 underline transition-colors hover:text-[var(--myth-ember)]">
                                    Change
                                </a>
                            </div>

                            {orgRegistry.length > 0 ? (
                                /* ── Registered org cards ── */
                                <div className={`mt-4 grid gap-3 ${orgRegistry.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                    {orgRegistry.map((entry) => {
                                        const isCurrent = isCurrentDb(entry);
                                        return (
                                            <button
                                                key={entry.orgId}
                                                type="button"
                                                onClick={() => handleOrgPick(entry)}
                                                className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400/30 ${
                                                    isCurrent
                                                        ? 'border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100/80'
                                                        : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/80'
                                                }`}
                                            >
                                                {/* Logo or initial avatar */}
                                                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                                                    {entry.logoBase64 ? (
                                                        <img
                                                            src={entry.logoBase64}
                                                            alt={entry.orgName}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-slate-100 text-3xl font-black text-sky-600">
                                                            {(entry.orgName || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    {/* Green dot — currently active database */}
                                                    {isCurrent && (
                                                        <div
                                                            className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-green-400 shadow-md"
                                                            title="Currently connected"
                                                        />
                                                    )}
                                                </div>

                                                {/* Org name + DB type badge */}
                                                <div className="min-w-0 w-full">
                                                    <p className="truncate text-sm font-bold text-white">{entry.orgName}</p>
                                                    <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                        entry.dbAdapter === 'firebase' ? 'text-orange-400' : 'text-cyan-400'
                                                    }`}>
                                                        {entry.dbAdapter === 'firebase' ? '🔥 Firebase' : `🖥️ ${getDbTypeLabel(entry)}`}
                                                    </p>
                                                    {isCurrent && (
                                                        <p className="mt-0.5 text-[10px] font-bold text-green-400">✓ Active</p>
                                                    )}
                                                </div>

                                                {/* Action label */}
                                                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                                    isCurrent
                                                        ? 'text-cyan-500 group-hover:text-cyan-300'
                                                        : 'text-gray-600 group-hover:text-orange-400'
                                                }`}>
                                                    {isCurrent ? 'Sign In →' : 'Switch DB & Sign In →'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* ── Empty state — no orgs registered ── */
                                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                                    <p className="mb-1 text-4xl select-none">🔌</p>
                                    <p className="mb-1 text-sm font-bold text-slate-700">No organisations registered yet</p>
                                    <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
                                        Use the Setup Wizard to connect a database and create your first organisation.
                                        It will appear here for fast one-click sign-in next time.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/setup')}
                                        className="inline-flex items-center gap-2 rounded-xl border border-orange-300 bg-orange-50 px-5 py-2.5 text-[11px] font-bold text-orange-600 transition-all hover:bg-orange-100"
                                    >
                                        🚀 Set Up First Organisation →
                                    </button>
                                </div>
                            )}

                            {/* Bottom row of actions */}
                            <div className="mt-4 flex items-center justify-between gap-3">
                                {orgRegistry.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/setup')}
                                        className="text-[11px] text-slate-500 underline transition-colors hover:text-[var(--myth-ember)]"
                                    >
                                        + Add another organisation
                                    </button>
                                )}
                                {/* Fallback: bypass picker and log in with whatever DB is active */}
                                <button
                                    type="button"
                                    onClick={() => setPickedOrg({
                                        orgId:         '_direct',
                                        orgName:       dbInfo.label,
                                        logoBase64:    null,
                                        dbAdapter:     dbInfo.type,
                                        firebaseConfig: null,
                                        restUrl:       null,
                                    })}
                                    className="ml-auto text-[11px] text-slate-500 underline transition-colors hover:text-slate-700"
                                >
                                    Continue with current database →
                                </button>
                            </div>
                        </div>

                    ) : (
                        /* ═══════════════════════════════════════════════════════════
                            SIGN IN / JOIN FORM
                            pickedOrg is set — DB is already correct (either it was
                            the active DB, or a page reload applied the new config).
                        ═══════════════════════════════════════════════════════════ */
                        <div>
                            {/* ── Selected org / DB header — ALWAYS shows "← Change" ── */}
                            <div className="mb-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                                {pickedOrg.orgId !== '_direct' && pickedOrg.logoBase64 ? (
                                    <img
                                        src={pickedOrg.logoBase64}
                                        alt={pickedOrg.orgName}
                                        className="h-9 w-9 flex-shrink-0 rounded-xl border border-slate-200 object-cover"
                                    />
                                ) : (
                                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-100 text-base font-black text-sky-600">
                                        {pickedOrg.orgId === '_direct' ? '🗄️' : (pickedOrg.orgName || '?').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold text-[var(--myth-ink)]">{pickedOrg.orgName}</p>
                                    <p className={`text-[10px] font-bold ${
                                        pickedOrg.dbAdapter === 'firebase' ? 'text-orange-500' : 'text-sky-600'
                                    }`}>
                                        {pickedOrg.dbAdapter === 'firebase' ? '🔥 Firebase' : `🖥️ ${getDbTypeLabel(pickedOrg)}`}
                                        {dbStatus === 'ok'    && <span className="ml-2 text-emerald-600 font-bold">✓ Connected</span>}
                                        {dbStatus === 'error' && <span className="ml-2 text-red-500 font-bold">⚠ Unreachable</span>}
                                    </p>
                                </div>
                                {/* Always visible — lets user go back to picker */}
                                <button
                                    type="button"
                                    onClick={() => setPickedOrg(null)}
                                    className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-[var(--myth-ember)]"
                                >
                                    ← Change
                                </button>
                            </div>

                            {dbStatus === 'error' && (
                                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
                                    <p className="mb-1 text-[11px] font-bold text-red-600">⚠ Database Unreachable</p>
                                    <p className="text-[10px] leading-relaxed text-slate-500">
                                        Cannot reach <span className="font-bold text-[var(--myth-ink)]">{dbInfo.label}</span>.{' '}
                                        Try{' '}
                                        <button type="button" onClick={() => setPickedOrg(null)} className="text-[var(--myth-ember)] underline hover:text-orange-700">
                                            selecting a different organisation
                                        </button>
                                        {' '}or{' '}
                                        <a href="/setup" className="text-[var(--myth-ember)] underline hover:text-orange-700">reconfigure the database</a>.
                                    </p>
                                </div>
                            )}

                            <p className="legendary-title text-[11px] text-[var(--myth-ember)]">
                                {isJoinMode ? 'Request Existing Org Access' : 'Enterprise Access'}
                            </p>
                            <h2 className="mt-2 text-4xl text-[var(--myth-ink)]">
                                {isJoinMode ? 'Join Your Organisation' : 'Access the Control Room'}
                            </h2>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">
                                {isJoinMode
                                    ? 'Already have a company workspace? Request access and wait for your admin to approve your account.'
                                    : 'Use your enterprise credentials to access the unified safety command environment.'}
                            </p>

                            {/* ── 2-tab nav ── */}
                            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
                                <button type="button" onClick={() => setAuthMode('login')}
                                    className={`myth-button px-2 py-2.5 text-[11px] ${authMode === 'login' ? 'myth-button-primary' : 'myth-button-secondary'}`}>
                                    Sign In
                                </button>
                                <button type="button" onClick={() => setAuthMode('join')}
                                    className={`myth-button px-2 py-2.5 text-[11px] ${isJoinMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>
                                    Join Existing Org
                                </button>
                            </div>

                            {/* ── SIGN IN FORM ── */}
                            {!isJoinMode ? (
                                <form onSubmit={handleLogin} className="mt-5 space-y-3">
                                    <div>
                                        <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Email Address</label>
                                        <input
                                            type="email" required
                                            value={email} onChange={(e) => setEmail(e.target.value)}
                                            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                            placeholder="you@company.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Password</label>
                                        <input
                                            type="password" required
                                            value={password} onChange={(e) => setPassword(e.target.value)}
                                            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                            placeholder="Enter your secure password"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setResetEmail((prev) => prev || email);
                                                setShowPasswordReset((prev) => !prev);
                                                setTimeout(() => document.getElementById('forgot-password-email')?.focus(), 0);
                                            }}
                                            className="font-bold uppercase tracking-[0.16em] text-[var(--myth-ember)] transition hover:text-orange-700"
                                        >
                                            Forgot password?
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAuthMode('join')}
                                            className="font-bold uppercase tracking-[0.16em] text-[var(--myth-muted)] transition hover:text-[var(--myth-ink)]"
                                        >
                                            New user in existing org
                                        </button>
                                    </div>

                                    {showPasswordReset && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <input
                                                    id="forgot-password-email"
                                                    type="email"
                                                    value={resetEmail}
                                                    onChange={(e) => setResetEmail(e.target.value)}
                                                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition"
                                                    placeholder="Password reset email"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleForgotPassword}
                                                    disabled={loading}
                                                    className="myth-button myth-button-secondary whitespace-nowrap px-4 py-2 text-[11px]"
                                                >
                                                    Send Reset
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <button type="submit" disabled={loading}
                                        className="myth-button myth-button-primary w-full px-4 py-3 text-sm">
                                        {loading ? 'Authenticating…' : 'Secure Sign In'}
                                    </button>

                                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                                        <p className="mb-2 text-[11px] text-slate-500">Need a new workspace?</p>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/setup')}
                                            className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-[11px] font-bold text-[var(--myth-ember)] transition-all hover:bg-orange-100"
                                        >
                                            🏢 Create a New Organisation →
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* ── JOIN EXISTING ORG FORM ── */
                                <form onSubmit={handleJoinExistingOrg} className="mt-5 space-y-3">
                                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                                        <p className="legendary-title text-[10px] text-[var(--myth-ember)]">Admin Approval Required</p>
                                        <p className="mt-1 text-[11px] leading-snug text-[var(--myth-muted)]">
                                            This creates a pending user in an existing organisation.
                                            Access starts only after admin approval.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Workspace Join Code</label>
                                        <input
                                            type="text" required
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))}
                                            className="w-full rounded-xl border px-4 py-2.5 text-sm uppercase tracking-[0.18em] outline-none transition"
                                            placeholder="JOIN-ABC123-XYZ9"
                                        />
                                        <p className="mt-1.5 text-[10px] leading-snug text-[var(--myth-muted)]">
                                            Ask your admin to generate this from User Management.
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Your Full Name</label>
                                            <input
                                                type="text" required
                                                value={userName} onChange={(e) => setUserName(e.target.value)}
                                                className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div>
                                            <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Account Email</label>
                                            <input
                                                type="email" required
                                                value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                                                className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                                placeholder="john@acme.com"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-ember)]">Secure Password</label>
                                        <input
                                            type="password" required
                                            value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                                            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                            placeholder="Minimum 6 characters"
                                        />
                                    </div>

                                    <button type="submit" disabled={loading}
                                        className="myth-button myth-button-primary mt-2 w-full px-4 py-3 text-sm">
                                        {loading ? 'Processing…' : 'Submit Access Request'}
                                    </button>

                                    <div className="text-center">
                                        <button type="button" onClick={() => navigate('/setup')}
                                            className="text-[11px] text-slate-500 underline transition-colors hover:text-[var(--myth-ember)]">
                                            Create a new organisation instead →
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* ── FOOTER — always visible ── */}
                    <div className="command-divider mt-5"></div>
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--myth-muted)]">
                            Powered by WE EHS Safety Tool
                        </p>
                        <a href="/setup"
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-[var(--myth-ember)]">
                            🗄️ Configure Database
                        </a>
                    </div>
                </section>

            </div>
        </div>
    );
}
