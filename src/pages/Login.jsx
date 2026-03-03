import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set, push } from 'firebase/database';

export default function Login() {
    const navigate = useNavigate();
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);

    // Login Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Registration Form State
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

            // 1. SECURE LOOKUP: Find which Org this user belongs to using the new directory
            const userDirRef = ref(rtdb, `userDirectory/${user.uid}`);
            const userDirSnap = await get(userDirRef);

            if (userDirSnap.exists()) {
                const userOrgId = userDirSnap.val().orgId;

                // 2. Fetch their specific profile from their isolated Organization
                const orgUserRef = ref(rtdb, `organizations/${userOrgId}/users/${user.uid}`);
                const orgUserSnap = await get(orgUserRef);

                if (orgUserSnap.exists()) {
                    const userData = orgUserSnap.val();

                    if (userData.status === 'Pending') {
                        setLoading(false);
                        await signOut(auth);
                        return alert("Your account is currently Pending. Please wait for your Organization Admin to approve your access.");
                    }

                    if (userData.status === 'Deleted' || userData.status === 'Inactive') {
                        setLoading(false);
                        await signOut(auth);
                        return alert("This account has been deactivated. Please contact your administrator.");
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
                    alert("Your account exists but was removed from the organization directory.");
                }
            } else {
                await signOut(auth);
                alert("Security Error: No organization mapping found for this account. You may be using a legacy test account. Please register a new one.");
            }
        } catch (error) {
            alert("Login Failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (regPassword.length < 6) return alert("Password must be at least 6 characters.");
        setLoading(true);

        try {
            // 1. Create Firebase Auth User FIRST so we get a token
            const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
            const user = userCredential.user;

            // 2. Use the secure registry to check if org exists, NOT the root organizations folder
            const safeOrgName = orgName.toLowerCase().trim().replace(/[\.#$\[\]]/g, '');
            const orgRegRef = ref(rtdb, `orgRegistry/${safeOrgName}`);
            const orgRegSnap = await get(orgRegRef);

            let existingOrgId = orgRegSnap.val();

            // 3. Join Existing OR Create New
            if (existingOrgId) {
                // JOIN EXISTING AS PENDING
                await set(ref(rtdb, `organizations/${existingOrgId}/users/${user.uid}`), {
                    name: userName,
                    email: user.email.toLowerCase().trim(),
                    role: "User",
                    assignedSite: "",
                    status: "Pending",
                    createdAt: new Date().toISOString()
                });

                // Map User to Org in the Secure Directory
                await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId: existingOrgId });

                await signOut(auth);
                alert(`Registration successful!\n\nThe workspace "${orgName}" already exists. Your account is in the 'Pending' queue.\nPlease ask your Organization Admin to approve you.`);

                setIsRegistering(false);
                setRegEmail(''); setRegPassword(''); setUserName(''); setOrgName('');

            } else {
                // CREATE BRAND NEW ORG (TENANT GENESIS)
                const newOrgRef = push(ref(rtdb, 'organizations'));
                const orgId = newOrgRef.key;

                await set(newOrgRef, {
                    details: { name: orgName, createdAt: new Date().toISOString(), ownerEmail: user.email },
                    sites: { "HQ-01": { code: "HQ-01", name: "Headquarters" } },
                    users: {
                        [user.uid]: {
                            name: userName,
                            email: user.email.toLowerCase().trim(),
                            role: "Global Owner",
                            assignedSite: "GLOBAL",
                            accessibleSites: ["GLOBAL"],
                            status: "Active",
                            createdAt: new Date().toISOString()
                        }
                    }
                });

                // Update Public Registries so future users can find it
                await set(ref(rtdb, `orgRegistry/${safeOrgName}`), orgId);
                await set(ref(rtdb, `userDirectory/${user.uid}`), { orgId: orgId });

                const sessionData = {
                    uid: user.uid,
                    email: user.email,
                    orgId: orgId,
                    name: userName,
                    role: "Global Owner",
                    assignedSite: "GLOBAL",
                    accessibleSites: ["GLOBAL"],
                    accessibleModules: ["Analytics", "Incidents", "Risk Assessment", "Participation", "Internal Audit", "CAPA Manager", "Training", "Improvement", "Record Emergency", "OHS Tools", "Sites", "Users"]
                };

                sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
                alert("Workspace created successfully! You are the Global Owner.");
                navigate('/dashboard');
            }
        } catch (error) {
            alert("Registration Failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen bg-slate-950 flex flex-col items-center justify-center font-['Space_Grotesk'] p-4 relative overflow-hidden">

            <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full pointer-events-none"></div>

            <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/20">
                        <i className="fas fa-shield-halved text-white text-2xl"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-white">ISO 45001 Portal</h1>
                    <p className="text-slate-400 text-sm mt-2">{isRegistering ? 'Setup or join your enterprise workspace' : 'Sign in to manage workplace safety'}</p>
                </div>

                <div className="flex bg-slate-950 rounded-xl p-1 mb-8 border border-slate-800">
                    <button type="button" onClick={() => setIsRegistering(false)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${!isRegistering ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}>Sign In</button>
                    <button type="button" onClick={() => setIsRegistering(true)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${isRegistering ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}>Register Org</button>
                </div>

                {!isRegistering ? (
                    <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in zoom-in duration-300">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Email Address</label>
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition" placeholder="you@company.com" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Password</label>
                            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition" placeholder="••••••••" />
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-900/20 uppercase tracking-widest text-sm mt-4">
                            {loading ? 'Authenticating...' : 'Secure Sign In'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in zoom-in duration-300">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Organization Name</label>
                            <input type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500 outline-none text-sm" placeholder="e.g. Acme Corp" />
                            <p className="text-[9px] text-slate-500 mt-1.5 ml-1"><i className="fas fa-info-circle mr-1"></i>If this name already exists, you will join as a pending user.</p>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Your Full Name</label>
                            <input type="text" required value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500 outline-none text-sm" placeholder="John Doe" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Account Email</label>
                            <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500 outline-none text-sm" placeholder="john@acme.com" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Secure Password</label>
                            <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500 outline-none text-sm" placeholder="••••••••" />
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-emerald-900/20 uppercase tracking-widest text-sm mt-6">
                            {loading ? 'Processing...' : 'Register & Initialize'}
                        </button>
                    </form>
                )}
            </div>

            <div className="mt-8 text-slate-600 text-xs font-bold tracking-widest uppercase">
                Enterprise OHS Management System
            </div>
        </div>
    );
}