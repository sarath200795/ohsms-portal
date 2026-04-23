import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { ref, get, set, push } from 'firebase/database';
import { normalizeSessionPermissions } from '../utils/permissions';
import { ACCOUNT_STATUS, canAuthenticateStatus, isDeletedStatus, isPendingStatus, writeStoredSession } from '../utils/session';

const FEATURE_HIGHLIGHTS = [
    { title: 'Smart RCA', icon: 'fa-brain', text: 'Incident narratives can auto-build 5-Why, fishbone, fault tree, CAPA suggestions, and HIRA review links.' },
    { title: 'QR Field Action', icon: 'fa-qrcode', text: 'Field teams scan PTW, LOTO, emergency equipment, and inspection tags to open the correct workflow instantly.' },
    { title: 'Audit-Ready PDFs', icon: 'fa-file-pdf', text: 'Generate formal records for incidents, HIRA, inspections, permits, emergency equipment, audits, and training.' },
    { title: 'Connected CAPA', icon: 'fa-list-check', text: 'Findings from incidents, audits, drills, inspections, and improvements feed one centralized action tracker.' },
    { title: 'Training Matrix', icon: 'fa-user-graduate', text: 'Track competence, expiry, retraining needs, contractor inductions, and CAPA-linked training sessions.' },
    { title: 'Site-Based Control', icon: 'fa-shield-halved', text: 'Role, module, site, vendor, and field-portal access controls keep users focused on approved work.' }
];

const UNIQUE_FEATURES = [
    { label: 'Live Command Hub', value: 'One dashboard for site activity, open CAPA, approvals, and module navigation.' },
    { label: 'Field Portal', value: 'Separate mobile-friendly portal for QR scanning, inspections, PTW, LOTO, incidents, and emergency equipment.' },
    { label: 'Vendor Portal', value: 'Controlled contractor area for worker records, documents, incidents, and permit visibility.' },
    { label: 'Activity Calendar', value: 'Daily, weekly, and monthly view of PTW, incidents, health, inspections, drills, meetings, and CAPA.' }
];

const MODULE_DETAILS = [
    {
        title: 'Incident Management',
        icon: 'fa-triangle-exclamation',
        tag: 'RCA + HIRA',
        detail: 'Report incidents, capture evidence, build investigation teams, generate smart RCA, assign CAPA, and link the event back to risk assessments.'
    },
    {
        title: 'Risk Assessment',
        icon: 'fa-shield-virus',
        tag: 'HIRA Register',
        detail: 'Create task-based HIRA records with hazards, controls, risk scoring, ALARP review, revision history, and controlled PDF output.'
    },
    {
        title: 'PTW',
        icon: 'fa-file-signature',
        tag: 'Permit Control',
        detail: 'Manage permit requests, approvals, live inspections, unsafe/safe observations, QR access, printouts, and field verification.'
    },
    {
        title: 'LOTO',
        icon: 'fa-lock',
        tag: 'Isolation Safety',
        detail: 'Generate isolation procedures, equipment tags, QR execution pages, verification steps, and procedure reports for field work.'
    },
    {
        title: 'Inspections',
        icon: 'fa-clipboard-check',
        tag: 'Scheduled Checks',
        detail: 'Assign inspections by start date, due date, frequency, site, owner, calendar visibility, completion status, CAPA, and PDFs.'
    },
    {
        title: 'Emergency Equipment',
        icon: 'fa-fire-extinguisher',
        tag: 'Asset Readiness',
        detail: 'Create equipment tags, inspect monthly checklists, track missed inspections, calculate next due dates, and print tag/report outputs.'
    },
    {
        title: 'Emergency Module',
        icon: 'fa-tower-broadcast',
        tag: 'Drills + Response',
        detail: 'Record mock drills, emergency events, lessons learned, response performance, action plans, and training links.'
    },
    {
        title: 'Training',
        icon: 'fa-person-chalkboard',
        tag: 'Competence Matrix',
        detail: 'Maintain training records, attendees, certificates, expiry alerts, retraining triggers, contractor induction, and CAPA-based courses.'
    },
    {
        title: 'Contractors',
        icon: 'fa-helmet-safety',
        tag: 'Vendor Control',
        detail: 'Register vendors, workers, documents, safety passports, induction status, permit history, and contractor incident records.'
    },
    {
        title: 'Audit + CAPA',
        icon: 'fa-magnifying-glass-chart',
        tag: 'Assurance Loop',
        detail: 'Plan audits, assign findings, capture responses, verify closure, and consolidate actions across all major EHS modules.'
    },
    {
        title: 'Health + Surveillance',
        icon: 'fa-heart-pulse',
        tag: 'Worker Health',
        detail: 'Track occupational health cases, surveillance, vaccination, illness records, restricted access, and follow-up evidence.'
    },
    {
        title: 'Analytics + Calendar',
        icon: 'fa-chart-line',
        tag: 'Leadership View',
        detail: 'Review trends, exposure hours, incident rates, site filters, activity calendar, management visibility, and performance reports.'
    }
];

const normalizeJoinCode = (value) => value.toUpperCase().trim().replace(/[^A-Z0-9-]/g, '');
const generateJoinCode = () => `JOIN-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

export default function Login() {
    const navigate = useNavigate();
    const [authMode, setAuthMode] = useState('login');
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [showPasswordReset, setShowPasswordReset] = useState(false);

    const [orgName, setOrgName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [userName, setUserName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');

    const isRegistering = authMode !== 'login';
    const isJoinMode = authMode === 'join';
    const isCreateMode = authMode === 'create';

    const resetRegistrationFields = () => {
        setRegEmail('');
        setRegPassword('');
        setUserName('');
        setOrgName('');
        setJoinCode('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const userDirRef = ref(rtdb, `userDirectory/${user.uid}`);
            const userDirSnap = await get(userDirRef);

            if (userDirSnap.exists()) {
                const userOrgId = userDirSnap.val().orgId;
                const orgUserRef = ref(rtdb, `organizations/${userOrgId}/users/${user.uid}`);
                const orgUserSnap = await get(orgUserRef);

                if (orgUserSnap.exists()) {
                    const userData = orgUserSnap.val();

                    if (isPendingStatus(userData.status)) {
                        setLoading(false);
                        await signOut(auth);
                        return alert('Your account is currently Pending. Please wait for your Organization Admin to approve your access.');
                    }

                    if (!canAuthenticateStatus(userData.status) || isDeletedStatus(userData.status)) {
                        setLoading(false);
                        await signOut(auth);
                        return alert('This account has been deactivated. Please contact your administrator.');
                    }

                    const sessionData = normalizeSessionPermissions({
                        uid: user.uid,
                        email: user.email,
                        orgId: userOrgId,
                        name: userData.name || user.email.split('@')[0],
                        role: userData.role || 'User',
                        status: userData.status || ACCOUNT_STATUS.ACTIVE,
                        assignedSite: userData.assignedSite || 'GLOBAL',
                        accessibleSites: userData.accessibleSites || [],
                        accessibleModules: userData.accessibleModules || []
                    });

                    writeStoredSession(sessionData);
                    navigate('/dashboard');
                } else {
                    await signOut(auth);
                    alert('Your account exists but was removed from the organization directory.');
                }
            } else {
                await signOut(auth);
                alert('Security Error: No organization mapping found for this account. You may be using a legacy test account. Please register a new one.');
            }
        } catch (error) {
            alert(`Login Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        const targetEmail = (resetEmail || email).trim().toLowerCase();
        if (!targetEmail) return alert('Please enter your email address first.');

        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, targetEmail);
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

    const handleJoinExistingOrg = async (e) => {
        e.preventDefault();
        if (regPassword.length < 6) return alert('Password must be at least 6 characters.');
        const normalizedJoinCode = normalizeJoinCode(joinCode);
        if (!normalizedJoinCode) return alert('Please enter the workspace join code provided by your admin.');
        setLoading(true);
        let createdUser = null;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, regEmail.trim().toLowerCase(), regPassword);
            const user = userCredential.user;
            createdUser = user;

            const joinSnap = await get(ref(rtdb, `joinRegistry/${normalizedJoinCode}`));
            const existingOrgId = joinSnap.val();

            if (!existingOrgId) {
                await deleteUser(user);
                return alert('This join code is invalid or has expired. Please ask your Organization Admin to generate a fresh code from User Management.');
            }

            await set(ref(rtdb, `organizations/${existingOrgId}/users/${user.uid}`), {
                name: userName.trim(),
                email: user.email.toLowerCase().trim(),
                role: 'User',
                assignedSite: '',
                accessibleSites: [],
                accessibleModules: [],
                status: ACCOUNT_STATUS.PENDING,
                joinCode: normalizedJoinCode,
                createdAt: new Date().toISOString()
            });

            await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId: existingOrgId });

            await signOut(auth);
            alert('Access request submitted.\n\nYour account is now pending approval. Please ask your Organization Admin to approve your access from User Management.');

            setAuthMode('login');
            resetRegistrationFields();
        } catch (error) {
            if (createdUser) {
                await deleteUser(createdUser).catch(() => {});
            }
            alert(`Join request failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWorkspace = async (e) => {
        e.preventDefault();
        if (regPassword.length < 6) return alert('Password must be at least 6 characters.');
        setLoading(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, regEmail.trim().toLowerCase(), regPassword);
            const user = userCredential.user;

            const newOrgRef = push(ref(rtdb, 'organizations'));
            const orgId = newOrgRef.key;
            const initialJoinCode = generateJoinCode();

            await set(newOrgRef, {
                details: {
                    name: orgName.trim(),
                    createdAt: new Date().toISOString(),
                    ownerEmail: user.email,
                    joinCode: initialJoinCode,
                    joinCodeUpdatedAt: new Date().toISOString(),
                    joinCodeUpdatedBy: user.email
                },
                sites: { 'HQ-01': { code: 'HQ-01', name: 'Headquarters' } },
                users: {
                    [user.uid]: {
                        name: userName.trim(),
                        email: user.email.toLowerCase().trim(),
                        role: 'Global Owner',
                        assignedSite: 'GLOBAL',
                        accessibleSites: ['GLOBAL'],
                        status: ACCOUNT_STATUS.ACTIVE,
                        createdAt: new Date().toISOString()
                    }
                }
            });

            await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId });
            await set(ref(rtdb, `joinRegistry/${initialJoinCode}`), orgId);

            const sessionData = normalizeSessionPermissions({
                uid: user.uid,
                email: user.email,
                orgId,
                name: userName.trim(),
                role: 'Global Owner',
                status: ACCOUNT_STATUS.ACTIVE,
                assignedSite: 'GLOBAL',
                accessibleSites: ['GLOBAL'],
                accessibleModules: [
                    'Analytics', 'Incidents', 'Risk Assessment', 'Participation',
                    'Internal Audit', 'CAPA Manager', 'Training', 'Improvement',
                    'Record Emergency', 'OHS Tools', 'Contractors', 'MOC',
                    'Inspections', 'Sites', 'Users'
                ]
            });

            writeStoredSession(sessionData);
            alert('Workspace created successfully! You are the Global Owner.');
            navigate('/dashboard');
        } catch (error) {
            alert(`Workspace creation failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="myth-shell min-h-screen overflow-y-auto bg-[#080705] px-3 py-4 text-white sm:px-4" style={{ overflowY: 'auto' }}>
            <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_0.72fr]">
                <section className="hero-banner flex flex-col justify-between rounded-[1.5rem] p-5 lg:p-6">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <div>
                        <p className="hud-chip mb-3">Tactical Operations Interface</p>
                        <div className="mb-4 flex items-center gap-4">
                            <img
                                src="/we-ehs-logo.jpg"
                                alt="WE EHS Logo"
                                className="h-16 w-16 rounded-2xl border border-[var(--myth-border-strong)] object-cover shadow-2xl sm:h-20 sm:w-20"
                            />
                            <div>
                                <p className="legendary-title text-xs text-[var(--myth-cyan)]">WE EHS Safety Tool</p>
                                <h1 className="mt-1 text-4xl text-white sm:text-5xl">Control Safer Operations</h1>
                            </div>
                        </div>
                        <p className="max-w-2xl text-sm leading-relaxed text-[var(--myth-muted)]">
                            A tactical command interface for modern EHS teams, designed for fast navigation, clear priorities, and confident action in live operations.
                        </p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {UNIQUE_FEATURES.map((feature) => (
                            <div key={feature.label} className="rounded-xl border border-[var(--myth-border)] bg-black/25 p-3 shadow-inner">
                                <p className="legendary-title text-[9px] text-[var(--myth-cyan)]">{feature.label}</p>
                                <p className="mt-1 text-[10px] leading-snug text-[var(--myth-muted)]">{feature.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5">
                        <p className="legendary-title mb-3 text-[10px] text-[var(--myth-cyan)]">Unique Platform Features</p>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {FEATURE_HIGHLIGHTS.slice(0, 4).map((feature) => (
                                <div key={feature.title} className="command-panel rounded-2xl p-3">
                                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--myth-border)] bg-black/30 text-[var(--myth-cyan)]">
                                        <i className={`fas ${feature.icon}`}></i>
                                    </div>
                                    <h3 className="text-lg font-black text-white">{feature.title}</h3>
                                    <p className="mt-1 text-[11px] leading-snug text-[var(--myth-muted)]">{feature.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
                        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                            <div>
                                <p className="legendary-title text-[10px] text-[var(--myth-cyan)]">Module Capability Map</p>
                                <h2 className="mt-1 text-2xl text-white">Connected EHS operations</h2>
                            </div>
                            <p className="max-w-sm text-[11px] leading-snug text-[var(--myth-muted)]">
                                Each module is connected so records, CAPA, training, QR access, and reports work as one system.
                            </p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                            {MODULE_DETAILS.slice(0, 8).map((module) => (
                                <div key={module.title} className="rounded-xl border border-[var(--myth-border)] bg-[rgba(8,10,12,0.72)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--myth-cyan)]/60 hover:bg-black/35">
                                    <div className="flex items-start gap-2">
                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--myth-border)] bg-black/30 text-[var(--myth-cyan)]">
                                            <i className={`fas ${module.icon}`}></i>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white">{module.title}</h3>
                                            <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--myth-cyan)]">{module.tag}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="command-panel flex flex-col justify-between rounded-[1.5rem] p-5 lg:p-6">
                    <div>
                        <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">
                            {isCreateMode ? 'Initialize Enterprise Workspace' : isJoinMode ? 'Request Existing Org Access' : 'Enterprise Access'}
                        </p>
                        <h2 className="mt-2 text-4xl text-white">
                            {isCreateMode ? 'Deploy a New Workspace' : isJoinMode ? 'Join Your Organization' : 'Access the Control Room'}
                        </h2>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">
                            {isCreateMode
                                ? 'Create a brand new enterprise workspace. You will become the Global Owner.'
                                : isJoinMode
                                    ? 'Already have a company workspace? Request access and wait for your admin to approve your account.'
                                : 'Use your enterprise credentials to access the unified safety command environment.'}
                        </p>

                        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--myth-border)] bg-[rgba(10,8,6,0.82)] p-1.5">
                            <button type="button" onClick={() => setAuthMode('login')} className={`myth-button px-2 py-2.5 text-[11px] ${authMode === 'login' ? 'myth-button-primary' : 'myth-button-secondary'}`}>Sign In</button>
                            <button type="button" onClick={() => setAuthMode('join')} className={`myth-button px-2 py-2.5 text-[11px] ${isJoinMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>Existing Org</button>
                            <button type="button" onClick={() => setAuthMode('create')} className={`myth-button px-2 py-2.5 text-[11px] ${isCreateMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>New Org</button>
                        </div>
                    </div>

                    {!isRegistering ? (
                        <form onSubmit={handleLogin} className="mt-5 space-y-3">
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Email Address</label>
                                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="you@company.com" />
                            </div>
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Password</label>
                                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="Enter your secure password" />
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
                                        <button type="button" onClick={handleForgotPassword} disabled={loading} className="myth-button myth-button-secondary whitespace-nowrap px-4 py-2 text-[11px]">
                                            Send Reset
                                        </button>
                                    </div>
                                </div>
                            )}
                            <button type="submit" disabled={loading} className="myth-button myth-button-primary w-full px-4 py-3 text-sm">
                                {loading ? 'Authenticating...' : 'Secure Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={isJoinMode ? handleJoinExistingOrg : handleCreateWorkspace} className="mt-5 space-y-3">
                            <div className={`rounded-xl border p-3 ${isJoinMode ? 'border-cyan-400/30 bg-cyan-950/20' : 'border-orange-400/30 bg-orange-950/20'}`}>
                                <p className="legendary-title text-[10px] text-[var(--myth-cyan)]">{isJoinMode ? 'Admin Approval Required' : 'Global Owner Setup'}</p>
                                <p className="mt-1 text-[11px] leading-snug text-[var(--myth-muted)]">
                                    {isJoinMode
                                        ? 'This creates a pending user in an existing organization. Access starts only after admin approval.'
                                        : 'This creates a new organization and assigns you as the first Global Owner.'}
                                </p>
                            </div>
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">{isJoinMode ? 'Workspace Join Code' : 'Organization Name'}</label>
                                {isJoinMode ? (
                                    <input type="text" required value={joinCode} onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))} className="w-full rounded-xl border px-4 py-2.5 text-sm uppercase tracking-[0.18em] outline-none transition" placeholder="JOIN-ABC123-XYZ9" />
                                ) : (
                                    <input type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="e.g. Acme Corp" />
                                )}
                                <p className="mt-1.5 text-[10px] leading-snug text-[var(--myth-muted)]">
                                    {isJoinMode ? 'Ask your admin to generate this from User Management. Organization names are no longer searchable from the login page.' : 'Choose a workspace name for your company. The secure join code is generated after setup.'}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Your Full Name</label>
                                    <input type="text" required value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="John Doe" />
                                </div>
                                <div>
                                    <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Account Email</label>
                                    <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="john@acme.com" />
                                </div>
                            </div>
                            <div>
                                <label className="legendary-title mb-1.5 block text-[10px] text-[var(--myth-cyan)]">Secure Password</label>
                                <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition" placeholder="Minimum 6 characters" />
                            </div>
                            <button type="submit" disabled={loading} className="myth-button myth-button-cyan mt-2 w-full px-4 py-3 text-sm">
                                {loading ? 'Processing...' : isJoinMode ? 'Submit Access Request' : 'Create Workspace'}
                            </button>
                        </form>
                    )}

                    <div className="command-divider mt-5"></div>
                    <p className="mt-3 text-center text-[10px] uppercase tracking-[0.24em] text-[var(--myth-muted)]">
                        Powered by WE EHS Safety Tool
                    </p>
                </section>
            </div>
        </div>
    );
}
