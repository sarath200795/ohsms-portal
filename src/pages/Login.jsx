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

    const isJoinMode = authMode === 'join';

    const resetJoinFields = () => {
        setRegEmail(''); setRegPassword(''); setUserName(''); setJoinCode('');
    };

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
                    'Security Error: No organisation mapping found for this account.\n\n' +
                    'You may be using a legacy test account. Please register a new one from the main page.'
                );
                return;
            }

            const userOrgId = userDirData.orgId;

            // 3. Load user record + password state from the org
            const [userData, passwordState] = await Promise.all([
                dbGet(`organizations/${userOrgId}/users/${user.uid}`),
                dbGet(`organizations/${userOrgId}/userPasswordState/${user.uid}`),
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
            const uid = await authService.createUser(regEmail.trim().toLowerCase(), regPassword);
            createdUid = uid;

            const existingOrgId = await dbGet(`joinRegistry/${code}`);
            if (!existingOrgId) {
                await authService.deleteUser(uid);
                alert('This join code is invalid or has expired. Please ask your Organisation Admin to generate a fresh code from User Management.');
                return;
            }

            await dbSet(`organizations/${existingOrgId}/users/${uid}`, {
                name:             userName.trim(),
                email:            regEmail.trim().toLowerCase(),
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
        <div className="myth-shell min-h-screen overflow-y-auto bg-[#080705] px-3 py-4 text-white sm:px-4" style={{ overflowY: 'auto' }}>
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
                    <div>
                        {/* ── DB status chip ── */}
                        <div className="mb-4 flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${dbStatus === 'ok' ? 'bg-green-400' : dbStatus === 'error' ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`} />
                            <span className={`text-[10px] font-bold ${dbInfo.color}`}>{dbInfo.label}</span>
                            {dbStatus === 'error' && (
                                <a href="/setup" className="ml-auto text-[10px] text-red-400 hover:text-red-300 underline transition-colors">
                                    Fix →
                                </a>
                            )}
                        </div>

                        {dbStatus === 'error' && (
                            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3">
                                <p className="text-[11px] font-bold text-red-400 mb-1">⚠ Database Unreachable</p>
                                <p className="text-[10px] text-gray-400 leading-relaxed">
                                    Cannot connect to{' '}
                                    <span className="font-bold text-white">{dbInfo.label}</span>.
                                    {' '}Check your configuration or{' '}
                                    <a href="/setup" className="text-cyan-400 underline hover:text-cyan-300">open the Database Setup Wizard</a>.
                                </p>
                            </div>
                        )}

                        <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">
                            {isJoinMode ? 'Request Existing Org Access' : 'Enterprise Access'}
                        </p>
                        <h2 className="mt-2 text-4xl text-white">
                            {isJoinMode ? 'Join Your Organisation' : 'Access the Control Room'}
                        </h2>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">
                            {isJoinMode
                                ? 'Already have a company workspace? Request access and wait for your admin to approve your account.'
                                : 'Use your enterprise credentials to access the unified safety command environment.'}
                        </p>

                        {/* ── 2-tab nav ── */}
                        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--myth-border)] bg-[rgba(10,8,6,0.82)] p-1.5">
                            <button type="button" onClick={() => setAuthMode('login')}
                                className={`myth-button px-2 py-2.5 text-[11px] ${authMode === 'login' ? 'myth-button-primary' : 'myth-button-secondary'}`}>
                                Sign In
                            </button>
                            <button type="button" onClick={() => setAuthMode('join')}
                                className={`myth-button px-2 py-2.5 text-[11px] ${isJoinMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>
                                Join Existing Org
                            </button>
                        </div>
                    </div>

                    {/* ── SIGN IN FORM ── */}
                    {!isJoinMode ? (
                        <form onSubmit={handleLogin} className="mt-5 space-y-3">
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Email Address</label>
                                <input
                                    type="email" required
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                    placeholder="you@company.com"
                                />
                            </div>
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Password</label>
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
                                    className="font-bold uppercase tracking-[0.16em] text-[var(--myth-cyan)] transition hover:text-white"
                                >
                                    Forgot password?
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('join')}
                                    className="font-bold uppercase tracking-[0.16em] text-[var(--myth-muted)] transition hover:text-white"
                                >
                                    New user in existing org
                                </button>
                            </div>

                            {showPasswordReset && (
                                <div className="rounded-xl border border-[var(--myth-border)] bg-black/20 p-3">
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

                            {/* NEW ORG CTA */}
                            <div className="rounded-xl border border-gray-700/40 bg-black/20 p-3 text-center mt-2">
                                <p className="text-[11px] text-gray-500 mb-2">Don't have an organisation yet?</p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-bold hover:bg-cyan-500/20 transition-all"
                                >
                                    🏢 Create a New Organisation →
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* ── JOIN EXISTING ORG FORM ── */
                        <form onSubmit={handleJoinExistingOrg} className="mt-5 space-y-3">
                            <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/20 p-3">
                                <p className="legendary-title text-[10px] text-[var(--myth-cyan)]">Admin Approval Required</p>
                                <p className="mt-1 text-[11px] leading-snug text-[var(--myth-muted)]">
                                    This creates a pending user in an existing organisation.
                                    Access starts only after admin approval.
                                </p>
                            </div>

                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Workspace Join Code</label>
                                <input
                                    type="text" required
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))}
                                    className="w-full rounded-xl border px-4 py-2.5 text-sm uppercase tracking-[0.18em] outline-none transition"
                                    placeholder="JOIN-ABC123-XYZ9"
                                />
                                <p className="mt-1.5 text-[10px] leading-snug text-[var(--myth-muted)]">
                                    Ask your admin to generate this from User Management. Organisation names are not searchable from this page.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Your Full Name</label>
                                    <input
                                        type="text" required
                                        value={userName} onChange={(e) => setUserName(e.target.value)}
                                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Account Email</label>
                                    <input
                                        type="email" required
                                        value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                        placeholder="john@acme.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Secure Password</label>
                                <input
                                    type="password" required
                                    value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition"
                                    placeholder="Minimum 6 characters"
                                />
                            </div>

                            <button type="submit" disabled={loading}
                                className="myth-button myth-button-cyan mt-2 w-full px-4 py-3 text-sm">
                                {loading ? 'Processing…' : 'Submit Access Request'}
                            </button>

                            <div className="text-center">
                                <button type="button" onClick={() => navigate('/')}
                                    className="text-[11px] text-gray-500 hover:text-cyan-400 transition-colors underline">
                                    Create a new organisation instead →
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── FOOTER ── */}
                    <div className="command-divider mt-5"></div>
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--myth-muted)]">
                            Powered by WE EHS Safety Tool
                        </p>
                        <a href="/setup"
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600 hover:text-cyan-400 transition-colors">
                            🗄️ Configure Database
                        </a>
                    </div>
                </section>

            </div>
        </div>
    );
}
