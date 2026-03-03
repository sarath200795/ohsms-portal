import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, update, push, set } from 'firebase/database';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { rtdb, auth } from '../config/firebase';

const ROLES = ['Global Owner', 'Global Manager', 'Site Owner', 'Site Manager', 'Lead Auditor', 'User'];
const MODULES = ['Analytics', 'Incidents', 'Risk Assessment', 'Participation', 'Internal Audit', 'CAPA Manager', 'Training', 'Improvement', 'Record Emergency', 'OHS Tools', 'Sites', 'Users'];

const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [val];
};

export default function Users() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    const [users, setUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [requests, setRequests] = useState([]);

    const [view, setView] = useState('users');

    const [editModal, setEditModal] = useState(null);
    const [requestModal, setRequestModal] = useState(false);
    const [createModal, setCreateModal] = useState(false);
    const [successModal, setSuccessModal] = useState(null);

    const [editForm, setEditForm] = useState(null);
    const [reqForm, setReqForm] = useState({ role: 'User', siteId: '', modules: [] });
    const [createForm, setCreateForm] = useState({ name: '', email: '', tempPassword: '', role: 'User', assignedSite: '', accessibleSites: [], accessibleModules: [] });

    useEffect(() => {
        try {
            const s = sessionStorage.getItem('isoSession');
            if (!s) { navigate('/'); return; }
            const sess = JSON.parse(s);

            const hasAccess = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(sess.role) || (sess.accessibleModules || []).includes('Users');
            if (!hasAccess) {
                alert("Security Alert: You do not have permission to access User Management.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            const loadData = async () => {
                try {
                    const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                    if (snap.exists()) {
                        const data = snap.val();
                        if (data.sites) {
                            setSites(Object.keys(data.sites).map(k => ({ code: data.sites[k].code || k, name: data.sites[k].name || k })));
                        }
                        if (data.users) {
                            const uList = Object.keys(data.users).map(k => ({ firebaseKey: k, ...data.users[k] })).filter(u => u.status !== 'Deleted');
                            setUsers(uList.sort((a, b) => {
                                if (a.status === 'Pending' && b.status !== 'Pending') return -1;
                                if (b.status === 'Pending' && a.status !== 'Pending') return 1;
                                return (a.name || '').localeCompare(b.name || '');
                            }));
                        }
                        if (data.permissionRequests) {
                            const reqList = Object.keys(data.permissionRequests).map(k => ({ firebaseKey: k, ...data.permissionRequests[k] }));
                            setRequests(reqList.sort((a, b) => new Date(b.date) - new Date(a.date)));
                        }
                    }
                } catch (e) { console.error(e); } finally { setLoading(false); }
            };
            loadData();
        } catch (error) {
            setLoading(false);
        }
    }, [navigate]);

    const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(session?.role);

    const canManageUser = (u) => {
        if (isGlobalAdmin) return true;
        if (isSiteAdmin && u.assignedSite === session?.assignedSite) return true;
        return false;
    };

    const canGrantRole = (r) => {
        if (isGlobalAdmin) return true;
        if (isSiteAdmin && ['Site Owner', 'Site Manager', 'User'].includes(r)) return true;
        return false;
    };

    const canGrantModule = (mod) => {
        if (isGlobalAdmin) return true;
        if (isSiteAdmin && mod !== 'Internal Audit') return true;
        return false;
    };

    const openCreateUser = () => {
        if (!isGlobalAdmin) return alert("Security Error: Only Global Admins can register new users directly.");
        const randomPass = Math.random().toString(36).slice(-6) + "A1!";
        setCreateForm({ name: '', email: '', tempPassword: randomPass, role: 'User', assignedSite: '', accessibleSites: [], accessibleModules: [] });
        setCreateModal(true);
    };

    const submitCreateUser = async () => {
        if (!createForm.name || !createForm.email || !createForm.assignedSite || !createForm.role || !createForm.tempPassword) {
            return alert("Name, Email, Role, Password, and Primary Site are required fields.");
        }

        if (createForm.tempPassword.length < 6) return alert("Firebase requires passwords to be at least 6 characters long.");

        const cleanEmail = createForm.email.toLowerCase().trim();
        const selectedRole = createForm.role;

        const isDuplicate = users.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
        if (isDuplicate) return alert("A user with this exact email already exists in the system.");

        try {
            const tempAppName = "tempApp-" + Date.now();
            const tempApp = initializeApp(auth.app.options, tempAppName);
            const tempAuth = getAuth(tempApp);

            let newUid;
            try {
                const userCredential = await createUserWithEmailAndPassword(tempAuth, cleanEmail, createForm.tempPassword);
                newUid = userCredential.user.uid;
                await signOut(tempAuth);
            } catch (authErr) {
                return alert("Auth Error: " + authErr.message);
            }

            const { tempPassword, ...formFields } = createForm;

            const payload = {
                ...formFields,
                email: cleanEmail,
                role: selectedRole,
                status: 'Active',
                createdBy: session?.email || 'System',
                createdAt: new Date().toISOString(),
                accessibleModules: createForm.accessibleModules || [],
                accessibleSites: createForm.accessibleSites || []
            };

            // 1. SAVE TO ORG SPECIFIC DIRECTORY
            await set(ref(rtdb, `organizations/${session.orgId}/users/${newUid}`), payload);

            // 2. REGISTER IN SECURE GLOBAL DIRECTORY
            await set(ref(rtdb, `userDirectory/${newUid}`), { orgId: session.orgId });

            setUsers([{ firebaseKey: newUid, ...payload }, ...users].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            setCreateModal(false);

            setSuccessModal({
                name: createForm.name,
                email: cleanEmail,
                password: createForm.tempPassword,
                role: selectedRole
            });

        } catch (e) { alert("Database Error: " + e.message); }
    };

    const openEdit = (u) => {
        if (!canManageUser(u)) return alert("You do not have permission to manage this user.");
        setEditForm({ ...u, accessibleSites: ensureArray(u.accessibleSites), accessibleModules: ensureArray(u.accessibleModules) });
        setEditModal(true);
    };

    const handleUpdateUser = async () => {
        if (!editForm.firebaseKey) return alert("Error: User key missing.");
        try {
            const { firebaseKey, ...updates } = editForm;
            updates.status = 'Active';

            await update(ref(rtdb, `organizations/${session.orgId}/users/${firebaseKey}`), updates);

            setUsers(users.map(u => u.firebaseKey === firebaseKey ? { ...updates, firebaseKey } : u).sort((a, b) => {
                if (a.status === 'Pending' && b.status !== 'Pending') return -1;
                if (b.status === 'Pending' && a.status !== 'Pending') return 1;
                return (a.name || '').localeCompare(b.name || '');
            }));

            setEditModal(false);
            alert("User permissions updated successfully. If they were Pending, they are now Active.");

            if (editForm.email === session?.email) {
                const newSess = { ...session, ...updates };
                sessionStorage.setItem('isoSession', JSON.stringify(newSess));
                setSession(newSess);
            }
        } catch (e) { alert("Failed to update user."); }
    };

    const handleDeleteUser = async (firebaseKey) => {
        if (!isGlobalAdmin) return alert("Security Error: Only Global Admins can delete users.");
        if (!window.confirm("CRITICAL WARNING: Are you sure you want to completely remove this user? Their login access will be permanently revoked.")) return;

        try {
            await update(ref(rtdb, `organizations/${session.orgId}/users/${firebaseKey}`), {
                status: 'Deleted', deletedBy: session?.email, deletedOn: new Date().toISOString()
            });
            // We do NOT delete them from the userDirectory so the Auth account remains valid, just denied access to the org.
            setUsers(users.filter(u => u.firebaseKey !== firebaseKey));
            alert("User successfully removed.");
        } catch (e) { alert("Failed to delete user."); }
    };

    const submitRequest = async () => {
        if (!reqForm.siteId) return alert("Please select a site to request access for.");
        try {
            const reqListRef = ref(rtdb, `organizations/${session.orgId}/permissionRequests`);
            const newReqRef = push(reqListRef);
            const payload = {
                id: newReqRef.key, userEmail: session.email, userName: session.name || session.user || 'User',
                requestedRole: reqForm.role, requestedSite: reqForm.siteId, requestedModules: reqForm.modules || [],
                status: 'Pending', date: new Date().toISOString()
            };
            await set(newReqRef, payload);
            setRequests([{ firebaseKey: newReqRef.key, ...payload }, ...requests]);
            alert("Permission request submitted.");
            setRequestModal(false);
            setView('requests');
        } catch (e) { alert("Failed to submit request."); }
    };

    const approveRequest = async (req) => {
        try {
            const targetUser = users.find(u => u.email === req.userEmail);
            if (!targetUser) return alert("User no longer exists in the database.");

            const updates = {
                status: 'Active',
                role: req.requestedRole,
                assignedSite: targetUser.assignedSite || req.requestedSite,
                accessibleSites: Array.from(new Set([...ensureArray(targetUser.accessibleSites), req.requestedSite])),
                accessibleModules: Array.from(new Set([...ensureArray(targetUser.accessibleModules), ...ensureArray(req.requestedModules)]))
            };

            await update(ref(rtdb, `organizations/${session.orgId}/users/${targetUser.firebaseKey}`), updates);
            await update(ref(rtdb, `organizations/${session.orgId}/permissionRequests/${req.firebaseKey}`), { status: 'Approved', approvedBy: session.email });

            setUsers(users.map(u => u.firebaseKey === targetUser.firebaseKey ? { ...u, ...updates } : u));
            setRequests(requests.map(r => r.firebaseKey === req.firebaseKey ? { ...r, status: 'Approved' } : r));
            alert("Request Approved. User access has been updated.");
        } catch (e) { alert("Failed to approve."); }
    };

    const toggleEditArray = (field, item) => {
        const arr = [...ensureArray(editForm[field])];
        if (arr.includes(item)) setEditForm({ ...editForm, [field]: arr.filter(i => i !== item) });
        else setEditForm({ ...editForm, [field]: [...arr, item] });
    };

    const toggleCreateArray = (field, item) => {
        const arr = [...ensureArray(createForm[field])];
        if (arr.includes(item)) setCreateForm({ ...createForm, [field]: arr.filter(i => i !== item) });
        else setCreateForm({ ...createForm, [field]: [...arr, item] });
    };

    const toggleReqArray = (item) => {
        const arr = [...ensureArray(reqForm.modules)];
        if (arr.includes(item)) setReqForm({ ...reqForm, modules: arr.filter(i => i !== item) });
        else setReqForm({ ...reqForm, modules: [...arr, item] });
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-['Space_Grotesk'] animate-pulse">Loading Directory...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-white">
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 z-10">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition"><i className="fas fa-arrow-left mr-2"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <h1 className="text-lg font-bold"><i className="fas fa-users-gear text-blue-400 mr-2"></i> Access Management</h1>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setRequestModal(true)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow"><i className="fas fa-hand-paper mr-2"></i> Request Access</button>
                </div>
            </header>

            <div className="flex justify-between items-center px-8 pt-6 border-b border-slate-800 pb-4 z-10">
                <div className="flex gap-4">
                    <button type="button" onClick={() => setView('users')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${view === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
                        Active Users
                        {users.filter(u => u.status === 'Pending').length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow">{users.filter(u => u.status === 'Pending').length}</span>}
                    </button>
                    <button type="button" onClick={() => setView('requests')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${view === 'requests' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
                        Pending Requests {requests.filter(r => r.status === 'Pending').length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow">{requests.filter(r => r.status === 'Pending').length}</span>}
                    </button>
                </div>

                {isGlobalAdmin && (
                    <button type="button" onClick={openCreateUser} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition flex items-center gap-2">
                        <i className="fas fa-user-plus"></i> Register New User
                    </button>
                )}
            </div>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative">
                <div className="max-w-7xl mx-auto">

                    {/* ACTIVE USERS TABLE */}
                    {view === 'users' && (
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-950 text-[10px] uppercase text-slate-400 font-bold tracking-widest border-b border-slate-800">
                                    <tr>
                                        <th className="p-4 pl-6">User Details</th>
                                        <th className="p-4">Role & Status</th>
                                        <th className="p-4">Primary Site</th>
                                        <th className="p-4">Access Count</th>
                                        <th className="p-4 pr-6 text-right">Admin Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {users.map(u => (
                                        <tr key={u.firebaseKey} className={`transition ${u.status === 'Pending' ? 'bg-orange-900/10 hover:bg-orange-900/20' : 'hover:bg-slate-800/50'}`}>
                                            <td className="p-4 pl-6">
                                                <div className="font-bold text-white flex items-center gap-2">
                                                    {u.name || 'Unknown User'}
                                                    {u.status === 'Pending' && <span className="bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">Awaiting Approval</span>}
                                                </div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </td>
                                            <td className="p-4"><span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider border ${u.role?.includes('Owner') || u.role?.includes('Manager') || u.role === 'Admin' ? 'bg-amber-900/30 text-amber-400 border-amber-500/30' : u.role === 'Lead Auditor' ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' : 'bg-slate-800 text-slate-300 border-slate-600'}`}>{u.role || 'User'}</span></td>
                                            <td className="p-4 font-mono text-slate-300 font-bold">{u.assignedSite || 'UNASSIGNED'}</td>
                                            <td className="p-4 text-xs text-slate-400">
                                                {ensureArray(u.accessibleSites).length} Sites<br />
                                                {ensureArray(u.accessibleModules).length} Modules
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {canManageUser(u) && (
                                                        <button type="button" onClick={() => openEdit(u)} className={`px-3 py-1.5 rounded text-xs font-bold transition border ${u.status === 'Pending' ? 'bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border-orange-500/30' : 'bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-500/30'}`}>
                                                            {u.status === 'Pending' ? 'Review & Approve' : 'Edit Rules'}
                                                        </button>
                                                    )}
                                                    {isGlobalAdmin && (
                                                        <button type="button" onClick={() => handleDeleteUser(u.firebaseKey)} className="bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-red-500/30">Remove</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500 italic">No users found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* PENDING REQUESTS */}
                    {view === 'requests' && (
                        <div className="space-y-4">
                            {requests.filter(r => r.status === 'Pending').length === 0 ? (
                                <div className="text-center py-20 text-slate-500 font-bold uppercase tracking-widest border-2 border-dashed border-slate-800 rounded-2xl">No pending access requests</div>
                            ) : (
                                requests.filter(r => r.status === 'Pending').map(r => {
                                    const isAuditReq = ensureArray(r.requestedModules).includes('Internal Audit') || r.requestedRole === 'Lead Auditor';
                                    const canApprove = isGlobalAdmin || (isSiteAdmin && !isAuditReq && r.requestedSite === session?.assignedSite);

                                    return (
                                        <div key={r.firebaseKey} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex justify-between items-center shadow-lg">
                                            <div>
                                                <h3 className="font-bold text-white">{r.userName} <span className="text-xs font-normal text-slate-500 ml-2">({r.userEmail})</span></h3>
                                                <div className="text-sm mt-2 text-slate-300">
                                                    Requested Role: <span className="font-bold text-amber-400">{r.requestedRole}</span> @ Site: <span className="font-bold font-mono text-blue-400">{r.requestedSite || 'GLOBAL'}</span>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-2 flex gap-2 flex-wrap">
                                                    Modules: {ensureArray(r.requestedModules).map(m => <span key={m} className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{m}</span>)}
                                                </div>
                                            </div>
                                            <div>
                                                {canApprove ? (
                                                    <button type="button" onClick={() => approveRequest(r)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-sm shadow transition flex items-center gap-2"><i className="fas fa-check"></i> Approve & Apply</button>
                                                ) : (
                                                    <span className="text-xs text-red-400 font-bold uppercase tracking-widest bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-500/30"><i className="fas fa-lock mr-1"></i> Requires Global Clearance</span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>
            </main>

            {createModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scroll">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                            <h2 className="text-xl font-bold text-white"><i className="fas fa-user-plus text-emerald-500 mr-2"></i> Register New User Account</h2>
                            <button type="button" onClick={() => setCreateModal(false)} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Full Name</label>
                                    <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Jane Doe" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-emerald-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Email Address (Unique Login)</label>
                                    <input value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} placeholder="jane@company.com" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-emerald-500" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-emerald-500 block mb-2">Temporary Password</label>
                                    <div className="flex items-center gap-2 w-full bg-slate-950 border border-emerald-900/50 rounded-xl p-1 pr-3 shadow-inner">
                                        <input value={createForm.tempPassword} onChange={e => setCreateForm({ ...createForm, tempPassword: e.target.value })} className="w-full bg-transparent border-none p-2 text-sm text-emerald-400 font-mono font-bold outline-none" />
                                        <button type="button" onClick={() => setCreateForm({ ...createForm, tempPassword: Math.random().toString(36).slice(-6) + "A1!" })} className="text-slate-500 hover:text-emerald-400 transition" title="Generate New"><i className="fas fa-sync-alt"></i></button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Assign Role</label>
                                    <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-emerald-500">
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Primary Site</label>
                                <select value={createForm.assignedSite} onChange={e => setCreateForm({ ...createForm, assignedSite: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-emerald-500">
                                    <option value="">-- Select Primary Site --</option>
                                    <option value="GLOBAL">GLOBAL (All Sites)</option>
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 border-b border-slate-800 pb-2">Additional Accessible Sites</label>
                                <div className="flex flex-wrap gap-3">
                                    {sites.map(s => (
                                        <label key={s.code} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition ${ensureArray(createForm.accessibleSites).includes(s.code) ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                                            <input type="checkbox" checked={ensureArray(createForm.accessibleSites).includes(s.code)} onChange={() => toggleCreateArray('accessibleSites', s.code)} className="hidden" />
                                            <span className="text-xs font-bold">{s.code}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 border-b border-slate-800 pb-2">Module Access Grants</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {MODULES.map(mod => (
                                        <label key={mod} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${ensureArray(createForm.accessibleModules).includes(mod) ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400 shadow-inner' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                                            <input type="checkbox" checked={ensureArray(createForm.accessibleModules).includes(mod)} onChange={() => toggleCreateArray('accessibleModules', mod)} className="w-4 h-4 accent-emerald-500" />
                                            <span className="text-xs font-bold">{mod}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-800 flex gap-4">
                                <button type="button" onClick={() => setCreateModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition tracking-widest uppercase text-sm border border-slate-700">Cancel</button>
                                <button type="button" onClick={submitCreateUser} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition tracking-widest uppercase text-sm"><i className="fas fa-check mr-2"></i> Create Profile & Auth</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {successModal && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i className="fas fa-check text-3xl text-emerald-500"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
                        <p className="text-sm text-slate-400 mb-8">Please copy these credentials and send them to the user.</p>

                        <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl text-left mb-8 space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Email / Login ID</label>
                                <div className="text-base font-bold text-white font-mono">{successModal.email}</div>
                            </div>
                            <div className="border-t border-slate-800 pt-4">
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1">Assigned Role</label>
                                <div className="text-sm font-bold text-blue-400">{successModal.role}</div>
                            </div>
                            <div className="border-t border-slate-800 pt-4">
                                <label className="text-[10px] uppercase font-bold text-emerald-500 tracking-widest block mb-1">Temporary Password</label>
                                <div className="text-xl font-black text-emerald-400 font-mono tracking-widest select-all bg-emerald-900/20 p-2 rounded border border-emerald-500/30 text-center">{successModal.password}</div>
                            </div>
                        </div>

                        <button type="button" onClick={() => setSuccessModal(null)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition tracking-widest uppercase text-sm shadow-lg shadow-emerald-900/20">I have copied the details</button>
                    </div>
                </div>
            )}

            {editModal && editForm && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scroll">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                            <h2 className="text-xl font-bold text-white">Edit Permissions: <span className="text-blue-400">{editForm.name}</span></h2>
                            <button type="button" onClick={() => setEditModal(false)} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        {isGlobalAdmin && (
                            <div className="mb-6 flex justify-end">
                                <button type="button" onClick={() => setEditForm({ ...editForm, accessibleSites: [], accessibleModules: [] })} className="text-[10px] bg-red-900/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white font-bold px-3 py-1.5 rounded-lg transition uppercase tracking-widest shadow">
                                    <i className="fas fa-ban mr-1"></i> Clear All Access Arrays
                                </button>
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Assign Role</label>
                                    <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-blue-500">
                                        {ROLES.map(r => (
                                            <option key={r} value={r} disabled={!canGrantRole(r)}>{r} {!canGrantRole(r) && '(Locked)'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Primary Site</label>
                                    <select value={editForm.assignedSite} onChange={e => setEditForm({ ...editForm, assignedSite: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-blue-500">
                                        {isGlobalAdmin && <option value="GLOBAL">GLOBAL (All Sites)</option>}
                                        {sites.map(s => <option key={s.code} value={s.code} disabled={!isGlobalAdmin && s.code !== session?.assignedSite}>{s.name} ({s.code})</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 border-b border-slate-800 pb-2">Additional Accessible Sites</label>
                                <div className="flex flex-wrap gap-3">
                                    {sites.map(s => {
                                        const isLocked = !isGlobalAdmin && s.code !== session?.assignedSite;
                                        return (
                                            <label key={s.code} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition ${isLocked ? 'opacity-50' : ''} ${ensureArray(editForm.accessibleSites).includes(s.code) ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                                                <input type="checkbox" checked={ensureArray(editForm.accessibleSites).includes(s.code)} onChange={() => !isLocked && toggleEditArray('accessibleSites', s.code)} disabled={isLocked} className="hidden" />
                                                <span className="text-xs font-bold">{s.code}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 border-b border-slate-800 pb-2">Module Access Grants</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {MODULES.map(mod => {
                                        const isLocked = !canGrantModule(mod);
                                        return (
                                            <label key={mod} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${isLocked ? 'opacity-50' : ''} ${ensureArray(editForm.accessibleModules).includes(mod) ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400 shadow-inner' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                                                <input type="checkbox" checked={ensureArray(editForm.accessibleModules).includes(mod)} onChange={() => !isLocked && toggleEditArray('accessibleModules', mod)} disabled={isLocked} className="w-4 h-4 accent-emerald-500" />
                                                <span className="text-xs font-bold">{mod}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-800">
                                <button type="button" onClick={handleUpdateUser} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition tracking-widest uppercase text-sm">
                                    {editForm.status === 'Pending' ? 'Approve Access & Save Permissions' : 'Save Permissions'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {requestModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Request System Access</h2>
                            <button type="button" onClick={() => setRequestModal(false)} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Requested Role</label>
                                <select value={reqForm.role} onChange={e => setReqForm({ ...reqForm, role: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500">
                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Requested Site</label>
                                <select value={reqForm.siteId} onChange={e => setReqForm({ ...reqForm, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500">
                                    <option value="">-- Select Site --</option>
                                    <option value="GLOBAL">GLOBAL (All Sites)</option>
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Requested Modules</label>
                                <div className="h-32 overflow-y-auto custom-scroll border border-slate-800 rounded-xl p-2 bg-slate-950 space-y-1 shadow-inner">
                                    {MODULES.map(mod => (
                                        <label key={mod} className="flex items-center gap-2 p-2 hover:bg-slate-900 rounded cursor-pointer">
                                            <input type="checkbox" checked={ensureArray(reqForm.modules).includes(mod)} onChange={() => toggleReqArray(mod)} className="accent-amber-500" />
                                            <span className="text-xs text-slate-300">{mod}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button type="button" onClick={submitRequest} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl shadow mt-4 tracking-widest uppercase text-sm">Submit Request</button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}} />
        </div>
    );
}