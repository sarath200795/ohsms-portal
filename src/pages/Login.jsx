import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set, push } from 'firebase/database';

export default function Login() {
    const navigate = useNavigate();
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [orgName, setOrgName] = useState('');
    const [userName, setUserName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');

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

                    if (userData.status === 'Pending') {
                        setLoading(false);
                        await signOut(auth);
                        return alert('Your account is currently Pending. Please wait for your Organization Admin to approve your access.');
                    }

                    if (userData.status === 'Deleted' || userData.status === 'Inactive') {
                        setLoading(false);
                        await signOut(auth);
                        return alert('This account has been deactivated. Please contact your administrator.');
                    }

                    const sessionData = {
                        uid: user.uid,
                        email: user.email,
                        orgId: userOrgId,
                        name: userData.name || user.email.split('@')[0],
                        role: userData.role || 'User',
                        assignedSite: userData.assignedSite || 'GLOBAL',
                        accessibleSites: userData.accessibleSites || [],
                        accessibleModules: userData.accessibleModules || []
                    };

                    sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
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

    const handleRegister = async (e) => {
        e.preventDefault();
        if (regPassword.length < 6) return alert('Password must be at least 6 characters.');
        setLoading(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
            const user = userCredential.user;

            const safeOrgName = orgName.toLowerCase().trim().replace(/[.#$[\]]/g, '');
            const orgRegRef = ref(rtdb, `orgRegistry/${safeOrgName}`);
            const orgRegSnap = await get(orgRegRef);
            const existingOrgId = orgRegSnap.val();

            if (existingOrgId) {
                await set(ref(rtdb, `organizations/${existingOrgId}/users/${user.uid}`), {
                    name: userName,
                    email: user.email.toLowerCase().trim(),
                    role: 'User',
                    assignedSite: '',
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                });

                await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId: existingOrgId });

                await signOut(auth);
                alert(`Registration successful!\n\nThe workspace "${orgName}" already exists. Your account is in the 'Pending' queue.\nPlease ask your Organization Admin to approve you.`);

                setIsRegistering(false);
                setRegEmail('');
                setRegPassword('');
                setUserName('');
                setOrgName('');
            } else {
                const newOrgRef = push(ref(rtdb, 'organizations'));
                const orgId = newOrgRef.key;

                await set(newOrgRef, {
                    details: { name: orgName, createdAt: new Date().toISOString(), ownerEmail: user.email },
                    sites: { 'HQ-01': { code: 'HQ-01', name: 'Headquarters' } },
                    users: {
                        [user.uid]: {
                            name: userName,
                            email: user.email.toLowerCase().trim(),
                            role: 'Global Owner',
                            assignedSite: 'GLOBAL',
                            accessibleSites: ['GLOBAL'],
                            status: 'Active',
                            createdAt: new Date().toISOString()
                        }
                    }
                });

                await set(ref(rtdb, `orgRegistry/${safeOrgName}`), orgId);
                await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId });

                const sessionData = {
                    uid: user.uid,
                    email: user.email,
                    orgId,
                    name: userName,
                    role: 'Global Owner',
                    assignedSite: 'GLOBAL',
                    accessibleSites: ['GLOBAL'],
                    accessibleModules: [
                        'Analytics', 'Incidents', 'Risk Assessment', 'Participation',
                        'Internal Audit', 'CAPA Manager', 'Training', 'Improvement',
                        'Record Emergency', 'OHS Tools', 'Contractors', 'MOC',
                        'Inspections', 'Sites', 'Users'
                    ]
                };

                sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
                alert('Workspace created successfully! You are the Global Owner.');
                navigate('/dashboard');
            }
        } catch (error) {
            alert(`Registration Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="myth-shell min-h-screen overflow-hidden bg-[#080705] px-4 py-8 text-white">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[1.18fr_0.82fr]">
                <section className="hero-banner flex flex-col justify-between rounded-[2rem] p-8 lg:p-12">
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

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="command-panel rounded-[1.6rem] p-5">
                            <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">Incident Control</p>
                            <h3 className="mt-2 text-3xl text-white">Incidents</h3>
                            <p className="mt-2 text-sm text-[var(--myth-muted)]">Investigations, CAPA, evidence, and reporting workflows.</p>
                        </div>
                        <div className="command-panel rounded-[1.6rem] p-5">
                            <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">Work Controls</p>
                            <h3 className="mt-2 text-3xl text-white">PTW + LOTO</h3>
                            <p className="mt-2 text-sm text-[var(--myth-muted)]">Live work controls, isolations, and field execution.</p>
                        </div>
                        <div className="command-panel rounded-[1.6rem] p-5">
                            <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">Field Access</p>
                            <h3 className="mt-2 text-3xl text-white">Portal Ops</h3>
                            <p className="mt-2 text-sm text-[var(--myth-muted)]">Separate field access with QR-driven operational tasks.</p>
                        </div>
                    </div>
                </section>

                <section className="command-panel flex flex-col justify-between rounded-[2rem] p-8 lg:p-10">
                    <div>
                        <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">
                            {isRegistering ? 'Initialize Enterprise Workspace' : 'Enterprise Access'}
                        </p>
                        <h2 className="mt-3 text-5xl text-white">{isRegistering ? 'Deploy a New Workspace' : 'Access the Control Room'}</h2>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--myth-muted)]">
                            {isRegistering
                                ? 'Create a new workspace or join an existing one as a pending team member.'
                                : 'Use your enterprise credentials to access the unified safety command environment.'}
                        </p>

                        <div className="mt-8 grid grid-cols-2 gap-3 rounded-[1.25rem] border border-[var(--myth-border)] bg-[rgba(10,8,6,0.82)] p-2">
                            <button type="button" onClick={() => setIsRegistering(false)} className={`myth-button px-4 py-3 text-sm ${!isRegistering ? 'myth-button-primary' : 'myth-button-secondary'}`}>Sign In</button>
                            <button type="button" onClick={() => setIsRegistering(true)} className={`myth-button px-4 py-3 text-sm ${isRegistering ? 'myth-button-primary' : 'myth-button-secondary'}`}>Register Org</button>
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
                            <button type="submit" disabled={loading} className="myth-button myth-button-primary w-full px-4 py-4 text-sm">
                                {loading ? 'Authenticating...' : 'Secure Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="mt-8 space-y-4">
                            <div>
                                <label className="legendary-title mb-2 block text-[11px] text-[var(--myth-cyan)]">Organization Name</label>
                                <input type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition" placeholder="e.g. Acme Corp" />
                                <p className="mt-2 text-[11px] text-[var(--myth-muted)]">If the workspace already exists, your account will enter the approval queue.</p>
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
                                {loading ? 'Processing...' : 'Register & Initialize'}
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
