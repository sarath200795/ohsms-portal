import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { ref, get, set, push } from 'firebase/database';
import { normalizeSessionPermissions } from '../utils/permissions';
import { ACCOUNT_STATUS, canAuthenticateStatus, isDeletedStatus, isPendingStatus, writeStoredSession } from '../utils/session';

const FEATURE_HIGHLIGHTS = [
    { title: 'Incidents + RCA', icon: 'fa-triangle-exclamation', text: 'Smart investigations, 5-Why, fishbone, CAPA, HIRA links, and printable reports.' },
    { title: 'PTW + LOTO', icon: 'fa-file-shield', text: 'Permit approvals, isolation procedures, tag generation, QR access, and field execution.' },
    { title: 'Risk + Training', icon: 'fa-shield-halved', text: 'Risk assessments, training matrix, CAPA-driven training needs, and competency records.' },
    { title: 'Field + Vendor Portals', icon: 'fa-qrcode', text: 'Separate QR-first field workflows and controlled contractor/vendor access.' },
    { title: 'Inspections + Equipment', icon: 'fa-clipboard-check', text: 'Scheduled inspections, emergency equipment checks, missed inspection tracking, and PDFs.' },
    { title: 'Analytics + Calendar', icon: 'fa-chart-line', text: 'Activity calendar, site filters, dashboards, CAPA visibility, and management reporting.' }
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
        <div className="myth-shell min-h-screen overflow-hidden bg-[#080705] px-4 py-8 text-white">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[1.18fr_0.82fr]">
                <section className="hero-banner flex flex-col justify-between rounded-[2rem] p-8 lg:p-12">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <div>
                        <p className="hud-chip mb-5">Tactical Operations Interface</p>
                        <div className="mb-6 flex items-center gap-5">
                            <img
                                src="/we-ehs-logo.jpg"
                                alt="WE EHS Logo"
                                className="h-24 w-24 rounded-[1.6rem] border border-[var(--myth-border-strong)] object-cover shadow-2xl"
                            />
                            <div>
                                <p className="legendary-title text-sm text-[var(--myth-cyan)]">WE EHS Safety Tool</p>
                                <h1 className="mt-2 text-6xl text-white sm:text-7xl">Control Safer Operations</h1>
                            </div>
                        </div>
                        <p className="max-w-2xl text-base leading-relaxed text-[var(--myth-muted)] sm:text-lg">
                            A tactical command interface for modern EHS teams, designed for fast navigation, clear priorities, and confident action in live operations.
                        </p>
                    </div>

                    <div>
                        <p className="legendary-title mb-4 text-[11px] text-[var(--myth-cyan)]">Key Platform Features</p>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {FEATURE_HIGHLIGHTS.map((feature) => (
                                <div key={feature.title} className="command-panel rounded-[1.4rem] p-4">
                                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--myth-border)] bg-black/30 text-[var(--myth-cyan)]">
                                        <i className={`fas ${feature.icon}`}></i>
                                    </div>
                                    <h3 className="text-xl font-black text-white">{feature.title}</h3>
                                    <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">{feature.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="command-panel flex flex-col justify-between rounded-[2rem] p-8 lg:p-10">
                    <div>
                        <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">
                            {isCreateMode ? 'Initialize Enterprise Workspace' : isJoinMode ? 'Request Existing Org Access' : 'Enterprise Access'}
                        </p>
                        <h2 className="mt-3 text-5xl text-white">
                            {isCreateMode ? 'Deploy a New Workspace' : isJoinMode ? 'Join Your Organization' : 'Access the Control Room'}
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--myth-muted)]">
                            {isCreateMode
                                ? 'Create a brand new enterprise workspace. You will become the Global Owner.'
                                : isJoinMode
                                    ? 'Already have a company workspace? Request access and wait for your admin to approve your account.'
                                : 'Use your enterprise credentials to access the unified safety command environment.'}
                        </p>

                        <div className="mt-8 grid grid-cols-3 gap-3 rounded-[1.25rem] border border-[var(--myth-border)] bg-[rgba(10,8,6,0.82)] p-2">
                            <button type="button" onClick={() => setAuthMode('login')} className={`myth-button px-3 py-3 text-xs ${authMode === 'login' ? 'myth-button-primary' : 'myth-button-secondary'}`}>Sign In</button>
                            <button type="button" onClick={() => setAuthMode('join')} className={`myth-button px-3 py-3 text-xs ${isJoinMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>New User</button>
                            <button type="button" onClick={() => setAuthMode('create')} className={`myth-button px-3 py-3 text-xs ${isCreateMode ? 'myth-button-primary' : 'myth-button-secondary'}`}>New Org</button>
                        </div>
                    </div>

                    {!isRegistering ? (
                        <form onSubmit={handleLogin} className="mt-8 space-y-5">
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Email Address</label>
                                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border px-4 py-3.5 text-base outline-none transition" placeholder="you@company.com" />
                            </div>
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Password</label>
                                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border px-4 py-3.5 text-base outline-none transition" placeholder="Enter your secure password" />
                            </div>
                            <div className="rounded-2xl border border-[var(--myth-border)] bg-black/20 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <input
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition"
                                        placeholder="Forgot password? Enter email"
                                    />
                                    <button type="button" onClick={handleForgotPassword} disabled={loading} className="myth-button myth-button-secondary whitespace-nowrap px-4 py-3 text-xs">
                                        Send Reset
                                    </button>
                                </div>
                                <p className="mt-2 text-[10px] leading-relaxed text-[var(--myth-muted)]">For security, reset requests show the same confirmation whether or not an account exists.</p>
                            </div>
                            <button type="submit" disabled={loading} className="myth-button myth-button-primary w-full px-4 py-4 text-sm">
                                {loading ? 'Authenticating...' : 'Secure Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={isJoinMode ? handleJoinExistingOrg : handleCreateWorkspace} className="mt-8 space-y-4">
                            <div className={`rounded-2xl border p-4 ${isJoinMode ? 'border-cyan-400/30 bg-cyan-950/20' : 'border-orange-400/30 bg-orange-950/20'}`}>
                                <p className="legendary-title text-[10px] text-[var(--myth-cyan)]">{isJoinMode ? 'Admin Approval Required' : 'Global Owner Setup'}</p>
                                <p className="mt-2 text-xs leading-relaxed text-[var(--myth-muted)]">
                                    {isJoinMode
                                        ? 'This creates a pending user in an existing organization. Access starts only after admin approval.'
                                        : 'This creates a new organization and assigns you as the first Global Owner.'}
                                </p>
                            </div>
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">{isJoinMode ? 'Workspace Join Code' : 'Organization Name'}</label>
                                {isJoinMode ? (
                                    <input type="text" required value={joinCode} onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))} className="w-full rounded-2xl border px-4 py-3 text-sm uppercase tracking-[0.18em] outline-none transition" placeholder="JOIN-ABC123-XYZ9" />
                                ) : (
                                    <input type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition" placeholder="e.g. Acme Corp" />
                                )}
                                <p className="mt-2 text-[11px] text-[var(--myth-muted)]">
                                    {isJoinMode ? 'Ask your admin to generate this from User Management. Organization names are no longer searchable from the login page.' : 'Choose a workspace name for your company. The secure join code is generated after setup.'}
                                </p>
                            </div>
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Your Full Name</label>
                                <input type="text" required value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition" placeholder="John Doe" />
                            </div>
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Account Email</label>
                                <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition" placeholder="john@acme.com" />
                            </div>
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Secure Password</label>
                                <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition" placeholder="Minimum 6 characters" />
                            </div>
                            <button type="submit" disabled={loading} className="myth-button myth-button-cyan mt-3 w-full px-4 py-4 text-sm">
                                {loading ? 'Processing...' : isJoinMode ? 'Submit Access Request' : 'Create Workspace'}
                            </button>
                        </form>
                    )}

                    <div className="command-divider mt-8"></div>
                    <p className="mt-5 text-center text-[11px] uppercase tracking-[0.28em] text-[var(--myth-muted)]">
                        Powered by WE EHS Safety Tool
                    </p>
                </section>
            </div>
        </div>
    );
}
