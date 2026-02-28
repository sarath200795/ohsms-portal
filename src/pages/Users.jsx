import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, update, remove, set } from 'firebase/database';
import { rtdb } from '../config/firebase';

const ROLES = ['Owner', 'Manager', 'User', 'Lead Auditor'];
const FIREBASE_API_KEY = "AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk";

const MODULES_LIST = [
    { id: 'incidents', label: 'Incidents & Hazards', icon: 'fa-triangle-exclamation' },
    { id: 'risk', label: 'Risk Assessment', icon: 'fa-shield-virus' },
    { id: 'audit', label: 'Internal Audit', icon: 'fa-clipboard-check' },
    { id: 'capa', label: 'CAPA Manager', icon: 'fa-list-check' },
    { id: 'training', label: 'Training & LMS', icon: 'fa-graduation-cap' },
    { id: 'mock-drill', label: 'Mock Drills', icon: 'fa-person-running' },
    { id: 'consultation', label: 'Consultation', icon: 'fa-comments' },
    { id: 'improvement', label: 'Improvements', icon: 'fa-chart-line' },
    { id: 'ohs-tools', label: 'OHS Tools (PTW)', icon: 'fa-toolbox' }
];

// ==========================================
// 1. ADD NEW USER MODAL
// ==========================================
const AddUserModal = ({ sites, orgId, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', role: 'User',
        assignedSite: 'GLOBAL', accessibleSites: [],
        accessibleModules: MODULES_LIST.map(m => m.id)
    });

    const handleToggle = (type, val) => {
        const list = formData[type];
        if (list.includes(val)) setFormData({ ...formData, [type]: list.filter(item => item !== val) });
        else setFormData({ ...formData, [type]: [...list, val] });
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, password: formData.password, returnSecureToken: true })
            });
            const authData = await authRes.json();
            if (!authRes.ok) throw new Error(authData.error.message.replace(/_/g, ' '));

            const newUid = authData.localId;
            const updates = {};

            // 1. Save in Organization Directory
            updates[`organizations/${orgId}/users/${newUid}`] = {
                name: formData.name, email: formData.email, role: formData.role,
                assignedSite: formData.assignedSite, accessibleSites: formData.accessibleSites,
                accessibleModules: formData.accessibleModules, status: 'Active',
                createdAt: new Date().toISOString()
            };

            await update(ref(rtdb), updates);

            // 2. SECURITY SYNC: Set the top-level security "passport" for Firebase Rules
            await set(ref(rtdb, `users/${newUid}`), {
                orgId: orgId,
                role: formData.role,
                email: formData.email,
                status: 'Active'
            });

            alert(`Success! Account created for ${formData.name}.`);
            onClose();
        } catch (err) { alert("Registration Failed: " + err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative flex flex-col max-h-[95vh]">
                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1"><i className="fas fa-user-plus text-emerald-500 mr-2"></i> Deploy Identity</h2>
                        <p className="text-xs text-slate-400">Configure credentials, site visibility, and module access.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 hover:text-red-400 w-8 h-8 rounded-xl flex items-center justify-center transition-colors"><i className="fas fa-times"></i></button>
                </div>

                <form id="add-user-form" onSubmit={handleCreateUser} className="flex-1 overflow-y-auto custom-scroll pr-2 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Credentials</h3>
                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Full Name</label><input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="John Doe" /></div>
                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Email</label><input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="john@company.com" /></div>
                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Temp Password</label><input required minLength="6" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500 font-mono" placeholder="Min 6 chars" /></div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 mt-4">System Role</label>
                            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-emerald-400 font-bold outline-none focus:border-emerald-500">
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        {formData.role === 'Owner' || formData.role === 'Lead Auditor' ? (
                            <div className="bg-emerald-900/10 border border-emerald-500/20 p-10 rounded-2xl text-center h-full flex flex-col items-center justify-center">
                                <i className="fas fa-globe text-5xl text-emerald-500/50 mb-4"></i>
                                <p className="text-emerald-400 font-bold text-lg">Unrestricted Access</p>
                                <p className="text-sm text-slate-400 mt-2 max-w-md">Owners and Lead Auditors automatically have global visibility and full access.</p>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Site Authorization</h3>
                                    <div className="flex gap-4 mb-4">
                                        <div className="flex-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Primary Site</label>
                                            <select value={formData.assignedSite} onChange={e => setFormData({ ...formData, assignedSite: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500">
                                                <option value="GLOBAL">Global / Corporate</option>
                                                {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Additional Site Visibility</label>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner max-h-40 overflow-y-auto custom-scroll">
                                        {sites.map(s => (
                                            <label key={s.code} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${formData.accessibleSites.includes(s.code) ? 'bg-emerald-900/20 border-emerald-500/50 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                                                <input type="checkbox" checked={formData.accessibleSites.includes(s.code)} onChange={() => handleToggle('accessibleSites', s.code)} className="w-3.5 h-3.5 accent-emerald-500" />
                                                <span className="text-xs font-medium truncate">{s.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Module Access Control</h3>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                        {MODULES_LIST.map(m => (
                                            <label key={m.id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${formData.accessibleModules.includes(m.id) ? 'bg-blue-900/20 border-blue-500/50 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                                                <input type="checkbox" checked={formData.accessibleModules.includes(m.id)} onChange={() => handleToggle('accessibleModules', m.id)} className="w-3.5 h-3.5 accent-blue-500" />
                                                <span className="text-xs font-medium flex items-center gap-2"><i className={`fas ${m.icon} text-[10px] opacity-50`}></i> {m.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </form>

                <div className="mt-8 flex gap-4 flex-shrink-0 border-t border-slate-800 pt-6">
                    <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-colors text-sm uppercase tracking-widest">Cancel</button>
                    <button type="submit" form="add-user-form" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-transform active:scale-95 text-sm uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Deploy
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 2. EDIT PERMISSION MODAL
// ==========================================
const PermissionModal = ({ user, sites, onClose, onSave }) => {
    const [role, setRole] = useState(user.role || 'User');
    const [assignedSite, setAssignedSite] = useState(user.assignedSite || 'GLOBAL');
    const [accessibleSites, setAccessibleSites] = useState(user.accessibleSites || []);
    const [accessibleModules, setAccessibleModules] = useState(user.accessibleModules || MODULES_LIST.map(m => m.id));
    const [status, setStatus] = useState(user.status || 'Active');

    const handleToggle = (setter, list, val) => {
        if (list.includes(val)) setter(list.filter(item => item !== val));
        else setter([...list, val]);
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1"><i className="fas fa-user-shield text-blue-500 mr-2"></i> Edit Access Rights</h2>
                        <p className="text-xs text-slate-400 font-mono">{user.email}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 hover:text-red-400 w-8 h-8 rounded-xl flex items-center justify-center transition-colors"><i className="fas fa-times"></i></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll pr-2 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-6">
                        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Core Identity</h3>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Account Status</label>
                            <select value={status} onChange={e => setStatus(e.target.value)} className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm outline-none font-bold ${status === 'Active' ? 'text-emerald-400 focus:border-emerald-500' : 'text-red-400 focus:border-red-500'}`}>
                                <option value="Active">Active (Granted Access)</option>
                                <option value="Inactive">Inactive (Revoked Access)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">System Role</label>
                            <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-blue-400 font-bold outline-none focus:border-blue-500">
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        {role !== 'Owner' && role !== 'Lead Auditor' && (
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Primary Assigned Site</label>
                                <select value={assignedSite} onChange={e => setAssignedSite(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white outline-none focus:border-blue-500">
                                    <option value="GLOBAL">Global / Corporate</option>
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        {role === 'Owner' || role === 'Lead Auditor' ? (
                            <div className="bg-blue-900/10 border border-blue-500/20 p-10 rounded-2xl text-center h-full flex flex-col items-center justify-center">
                                <i className="fas fa-unlock-keyhole text-5xl text-blue-500/50 mb-4"></i>
                                <p className="text-blue-400 font-bold text-lg">System Override Active</p>
                                <p className="text-sm text-slate-400 mt-2 max-w-md">Global access active for this role.</p>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Additional Site Visibility</h3>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner max-h-40 overflow-y-auto custom-scroll">
                                        <label className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${accessibleSites.includes('GLOBAL') ? 'bg-blue-900/20 border-blue-500/50 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                                            <input type="checkbox" checked={accessibleSites.includes('GLOBAL')} onChange={() => handleToggle(setAccessibleSites, accessibleSites, 'GLOBAL')} className="w-3.5 h-3.5 accent-blue-500" />
                                            <span className="text-xs font-medium">Global Overview</span>
                                        </label>
                                        {sites.map(s => (
                                            <label key={s.code} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${accessibleSites.includes(s.code) ? 'bg-blue-900/20 border-blue-500/50 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                                                <input type="checkbox" checked={accessibleSites.includes(s.code)} onChange={() => handleToggle(setAccessibleSites, accessibleSites, s.code)} className="w-3.5 h-3.5 accent-blue-500" />
                                                <span className="text-xs font-medium truncate">{s.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Module Authorization</h3>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                        {MODULES_LIST.map(m => (
                                            <label key={m.id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${accessibleModules.includes(m.id) ? 'bg-emerald-900/20 border-emerald-500/50 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                                                <input type="checkbox" checked={accessibleModules.includes(m.id)} onChange={() => handleToggle(setAccessibleModules, accessibleModules, m.id)} className="w-3.5 h-3.5 accent-emerald-500" />
                                                <span className="text-xs font-medium flex items-center gap-2"><i className={`fas ${m.icon} text-[10px] opacity-50`}></i> {m.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex gap-4 flex-shrink-0 border-t border-slate-800 pt-6">
                    <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-colors text-sm uppercase tracking-widest">Cancel</button>
                    <button onClick={() => onSave(user.id, { role, assignedSite, accessibleSites, accessibleModules, status })} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-transform active:scale-95 text-sm uppercase tracking-widest"><i className="fas fa-save mr-2"></i> Update Rules</button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 3. MAIN USERS COMPONENT
// ==========================================
export default function Users() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('registry');
    const [users, setUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [accessRequests, setAccessRequests] = useState([]);
    const [editUser, setEditUser] = useState(null);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        if (sess.role !== 'Owner') {
            alert("Access Denied. Only Owners can manage users.");
            navigate('/dashboard'); return;
        }
        setSession(sess);

        const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
        const unsubscribe = onValue(dbRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.users) {
                    const parsedUsers = Object.keys(data.users).map(k => ({ id: k, ...data.users[k] }));
                    setUsers(parsedUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
                }
                if (data.sites) {
                    setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                }
                if (data.accessRequests) {
                    setAccessRequests(Object.keys(data.accessRequests).map(k => ({ id: k, ...data.accessRequests[k] })));
                } else {
                    setAccessRequests([]);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate]);

    const filteredUsers = useMemo(() => {
        return users.filter(u => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [users, searchQuery]);

    const updatePermissions = async (userId, newPerms) => {
        try {
            // 1. Update in Organization Directory
            await update(ref(rtdb, `organizations/${session.orgId}/users/${userId}`), newPerms);

            // 2. SECURITY SYNC: Update the top-level passport for rules
            const userRef = users.find(u => u.id === userId);
            await set(ref(rtdb, `users/${userId}`), {
                orgId: session.orgId,
                role: newPerms.role,
                email: userRef?.email,
                status: newPerms.status
            });

            setEditUser(null);
        } catch (e) { alert("Failed to update user: " + e.message); }
    };

    const deleteUser = async (userId, name) => {
        if (window.confirm(`PERMANENT ACTION:\n\nRemove ${name || 'this user'}?`)) {
            try {
                await remove(ref(rtdb, `organizations/${session.orgId}/users/${userId}`));
                await remove(ref(rtdb, `users/${userId}`)); // Also remove their security passport
            }
            catch (e) { alert("Failed to delete user: " + e.message); }
        }
    };

    const approveRequest = async (req) => {
        try {
            const u = users.find(x => x.id === req.userId);
            if (u) {
                const newSites = [...new Set([...(u.accessibleSites || []), req.siteCode])];
                await update(ref(rtdb, `organizations/${session.orgId}/users/${req.userId}`), { accessibleSites: newSites });
            }
            await remove(ref(rtdb, `organizations/${session.orgId}/accessRequests/${req.id}`));
            alert(`Approved!`);
        } catch (e) { alert("Approval failed."); }
    };

    const rejectRequest = async (reqId) => {
        if (window.confirm("Reject request?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/accessRequests/${reqId}`));
        }
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'Owner': return 'bg-purple-900/30 text-purple-400 border-purple-500/30';
            case 'Manager': return 'bg-blue-900/30 text-blue-400 border-blue-500/30';
            case 'Lead Auditor': return 'bg-amber-900/30 text-amber-400 border-amber-500/30';
            default: return 'bg-slate-800 text-slate-300 border-slate-600';
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white"><div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div></div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-white overflow-hidden relative">
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <h1 className="text-base font-bold text-white uppercase hidden md:block">Identity Manager</h1>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner">
                    <button onClick={() => setActiveTab('registry')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'registry' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>Registry</button>
                    <button onClick={() => setActiveTab('requests')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'requests' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                        Requests {accessRequests.length > 0 && <span className="bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{accessRequests.length}</span>}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto w-full relative z-10">
                <main className="p-8 max-w-7xl mx-auto w-full">
                    {activeTab === 'registry' ? (
                        <>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">User Registry</h2>
                                    <p className="text-sm text-slate-400">Manage operational roles and access.</p>
                                </div>
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="relative group flex-1 md:w-64">
                                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                        <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-950 border border-slate-800 pl-11 pr-4 py-3 rounded-xl text-sm text-white focus:border-blue-500 outline-none" />
                                    </div>
                                    <button onClick={() => setIsAddingUser(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 text-sm uppercase tracking-widest">Deploy User</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredUsers.map(u => (
                                    <div key={u.id} className="glass-panel p-6 rounded-3xl relative group border border-slate-800 hover:border-blue-500/30 transition-all flex flex-col justify-between h-[280px] overflow-hidden">
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xl font-bold text-slate-300">{u.name?.charAt(0).toUpperCase()}</div>
                                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${getRoleColor(u.role)}`}>{u.role}</span>
                                            </div>
                                            <h3 className="font-bold text-white text-lg truncate mb-1">{u.name}</h3>
                                            <p className="text-[10px] text-slate-400 font-mono truncate mb-4">{u.email}</p>
                                        </div>
                                        <div className="mt-auto relative z-10">
                                            <div className="flex justify-between items-end">
                                                <div className={`bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex-1 mr-3 ${u.status === 'Inactive' ? 'opacity-50' : ''}`}>
                                                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-widest">Access Site</div>
                                                    <div className="text-xs font-bold text-emerald-400 truncate">{u.assignedSite || 'Global'}</div>
                                                </div>
                                                <button onClick={() => setEditUser(u)} className="bg-slate-950 border border-slate-800 hover:border-blue-500 hover:bg-blue-600 hover:text-white text-slate-400 w-10 h-10 rounded-xl flex items-center justify-center transition-all"><i className="fas fa-user-edit"></i></button>
                                            </div>
                                        </div>
                                        {u.role !== 'Owner' && <button onClick={() => deleteUser(u.id, u.name)} className="absolute top-4 left-1/2 -translate-x-1/2 -translate-y-12 opacity-0 group-hover:opacity-100 group-hover:-translate-y-0 transition-all bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl">Revoke</button>}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="max-w-4xl mx-auto">
                            <h2 className="text-3xl font-bold text-white mb-8">Access Requests</h2>
                            {accessRequests.length === 0 ? (
                                <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/40">No pending requests.</div>
                            ) : (
                                <div className="space-y-4">
                                    {accessRequests.map(req => (
                                        <div key={req.id} className="bg-slate-900 border border-slate-700 p-6 rounded-2xl flex justify-between items-center shadow-lg">
                                            <div>
                                                <h4 className="font-bold text-white text-lg">{req.userName}</h4>
                                                <p className="text-sm text-slate-300">Requests access to: <span className="text-emerald-400 font-bold">{req.siteName}</span></p>
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={() => rejectRequest(req.id)} className="bg-slate-800 hover:bg-red-900/50 text-slate-400 px-5 py-3 rounded-xl font-bold text-xs">Deny</button>
                                                <button onClick={() => approveRequest(req)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-transform active:scale-95">Approve</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
            {isAddingUser && <AddUserModal sites={sites} orgId={session.orgId} onClose={() => setIsAddingUser(false)} />}
            {editUser && <PermissionModal user={editUser} sites={sites} onClose={() => setEditUser(null)} onSave={updatePermissions} />}
        </div>
    );
}