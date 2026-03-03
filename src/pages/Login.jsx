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

            // Find which organization this user belongs to
            const orgsRef = ref(rtdb, 'organizations');
            const orgsSnap = await get(orgsRef);

            let userFound = false;
            let userData = null;
            let userOrgId = null;

            if (orgsSnap.exists()) {
                const orgs = orgsSnap.val();
                for (const orgId in orgs) {
                    if (orgs[orgId].users) {
                        const userKey = Object.keys(orgs[orgId].users).find(
                            key => orgs[orgId].users[key].email?.toLowerCase().trim() === email.toLowerCase().trim()
                        );
                        if (userKey) {
                            userData = orgs[orgId].users[userKey];
                            userOrgId = orgId;
                            userFound = true;
                            break;
                        }
                    }
                }
            }

            if (userFound) {
                // BLOCK PENDING OR DEACTIVATED USERS
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

                // STRICT SESSION STORAGE: Pull exactly what is in the DB
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
                alert("Account authenticated, but not assigned to an active Organization directory.");
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
            // 1. Create Firebase Auth User FIRST so we have database permissions
            const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
            const user = userCredential.user;

            // 2. NOW check if the Organization already exists
            const orgsRef = ref(rtdb, 'organizations');
            const orgsSnap = await get(orgsRef);
            let existingOrgId = null;
            let adminEmail = null;

            if (orgsSnap.exists()) {
                const orgs = orgsSnap.val();
                for (const id in orgs) {
                    if (orgs[id].details?.name?.toLowerCase().trim() === orgName.toLowerCase().trim()) {
                        existingOrgId = id;
                        // Capture the admin's email to show the user
                        adminEmail = orgs[id].details?.ownerEmail || 'the system administrator';
                        break;
                    }
                }
            }

            // 3. Split Logic: Join Existing vs Create New
            if (existingOrgId) {
                // JOIN EXISTING ORG AS PENDING
                const newUserRef = ref(rtdb, `organizations/${existingOrgId}/users/${user.uid}`);
                await set(newUserRef, {
                    name: userName,
                    email: user.email.toLowerCase().trim(),
                    role: "User",
                    assignedSite: "", // No site access until approved
                    status: "Pending", // Forces Admin approval
                    createdAt: new Date().toISOString()
                });

                await signOut(auth); // Log them out immediately

                // Show detailed pop-up with Admin Email
                alert(`Registration successful!\n\nThe workspace "${orgName}" already exists. Your account has been placed in a 'Pending' queue.\n\nPlease contact your Organization Admin (${adminEmail}) to request access approval.`);

                setIsRegistering(false);
                setRegEmail('');
                setRegPassword('');
                setUserName('');
                setOrgName('');

            } else {
                // CREATE BRAND NEW ORG (FIRST USER = ACTIVE GLOBAL OWNER)
                const newOrgRef = push(ref(rtdb, 'organizations'));
                const orgId = newOrgRef.key;

                const newOrgData = {
                    details: {
                        name: orgName,
                        createdAt: new Date().toISOString(),
                        ownerEmail: user.email
                    },
                    sites: {
                        "HQ-01": { code: "HQ-01", name: "Headquarters" }
                    },
                    users: {
                        [user.uid]: {
                            name: userName,
                            email: user.email.toLowerCase().trim(),
                            role: "Global Owner", // Supreme access
                            assignedSite: "GLOBAL",
                            accessibleSites: ["GLOBAL"],
                            status: "Active", // Auto-approved
                            createdAt: new Date().toISOString()
                        }
                    }
                };

                await set(newOrgRef, newOrgData);

                // Set Session and Auto-Login
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
                alert("Workspace created successfully! You have been granted Global Owner permissions.");
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