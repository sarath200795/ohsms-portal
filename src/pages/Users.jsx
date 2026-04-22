import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, set, update, remove, push } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { toCanonicalModuleIds, USER_ASSIGNABLE_MODULES } from '../utils/permissions';
import { ACCOUNT_STATUS, readStoredSession } from '../utils/session';
import {
    buildPermissionRequestUpdates,
    buildUserAccessAuditEntry,
    normalizeUserAccessPayload,
    validateUserAccessPayload
} from '../utils/userAccess';

const ROLES = [
    "Global Owner",
    "Global Manager",
    "Admin",
    "Site Owner",
    "Site Manager",
    "Lead Auditor",
    "User"
];

const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
};

export default function Users() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [users, setUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [permissionRequests, setPermissionRequests] = useState({});

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        role: 'User',
        assignedSite: '',
        accessibleSites: [],
        accessibleModules: [],
        status: ACCOUNT_STATUS.ACTIVE
    });

    const editingUser = useMemo(
        () => users.find((user) => user.id === editingUserId) || null,
        [users, editingUserId]
    );

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) { navigate('/'); return; }

        // Security Check: Only Global Admins or Owners should manage users
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        if (!isGlobalAdmin) {
            alert("Security Alert: Only Administrators can access User Management.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();

                    if (data.sites) {
                        setSites(Object.keys(data.sites).map(key => ({
                            code: data.sites[key].code || key,
                            name: data.sites[key].name || key
                        })));
                    }

                    if (data.users) {
                        const loadedUsers = Object.entries(data.users).map(([key, val]) => ({
                            id: key,
                            ...val,
                            accessibleSites: safeArr(val.accessibleSites),
                            accessibleModules: toCanonicalModuleIds(val.accessibleModules)
                        }));
                        setUsers(loadedUsers);
                    }

                    setPermissionRequests(data.permissionRequests || {});
                }
            } catch (err) {
                console.error("Error fetching users:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [navigate]);

    const openModal = (user = null) => {
        if (user) {
            setEditingUserId(user.id);
            setFormData({
                name: user.name || '',
                email: user.email || '',
                role: user.role || 'User',
                assignedSite: user.assignedSite || '',
                accessibleSites: safeArr(user.accessibleSites),
                accessibleModules: toCanonicalModuleIds(user.accessibleModules),
                // Pending users are opened in approval-ready mode so a normal save activates them.
                status: user.status === ACCOUNT_STATUS.PENDING ? ACCOUNT_STATUS.ACTIVE : (user.status || ACCOUNT_STATUS.ACTIVE)
            });
        } else {
            setEditingUserId(null);
            setFormData({
                name: '',
                email: '',
                role: 'User',
                assignedSite: '',
                accessibleSites: [],
                accessibleModules: [],
                status: ACCOUNT_STATUS.ACTIVE
            });
        }
        setIsModalOpen(true);
    };

    const toggleArrayItem = (field, item) => {
        setFormData(prev => {
            const currentArr = prev[field];
            const exists = currentArr.includes(item);
            return {
                ...prev,
                [field]: exists ? currentArr.filter(i => i !== item) : [...currentArr, item]
            };
        });
    };

    const selectAllModules = () => {
        setFormData(prev => ({ ...prev, accessibleModules: USER_ASSIGNABLE_MODULES.map((module) => module.id) }));
    };

    const clearAllModules = () => {
        setFormData(prev => ({ ...prev, accessibleModules: [] }));
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = normalizeUserAccessPayload(formData, { editingExistingUser: Boolean(editingUserId) });
            const validation = validateUserAccessPayload(payload);

            if (!validation.isValid) {
                setSaving(false);
                return alert(validation.errors.join('\n'));
            }

            // If editing existing user
            if (editingUserId) {
                await update(ref(rtdb, `organizations/${session.orgId}/users/${editingUserId}`), payload);

                const requestUpdates = buildPermissionRequestUpdates({
                    permissionRequests,
                    email: payload.email,
                    nextStatus: payload.status,
                    actorSession: session
                });

                if (Object.keys(requestUpdates).length > 0) {
                    await update(ref(rtdb, `organizations/${session.orgId}/permissionRequests`), requestUpdates);
                    setPermissionRequests((prev) => {
                        const next = { ...prev };
                        Object.entries(requestUpdates).forEach(([path, value]) => {
                            const [requestId, field] = path.split('/');
                            next[requestId] = { ...(next[requestId] || {}), [field]: value };
                        });
                        return next;
                    });
                }

                await set(
                    push(ref(rtdb, `organizations/${session.orgId}/accessAuditLogs`)),
                    buildUserAccessAuditEntry({
                        actorSession: session,
                        beforeUser: editingUser,
                        afterUser: payload,
                        targetUserId: editingUserId,
                        action: editingUser?.status === ACCOUNT_STATUS.PENDING && payload.status === ACCOUNT_STATUS.ACTIVE
                            ? 'user-approved'
                            : 'user-access-updated'
                    })
                );

                setUsers(prev => prev.map(u => u.id === editingUserId ? { ...payload, id: editingUserId } : u));
                alert("User permissions updated successfully!");
            } else {
                // For new users (Using email as safe key by replacing dots)
                const safeEmailKey = payload.email.replace(/\./g, '_');

                // Check if exists
                const userRef = ref(rtdb, `organizations/${session.orgId}/users/${safeEmailKey}`);
                const existing = await get(userRef);

                if (existing.exists()) {
                    setSaving(false);
                    return alert("A user with this email already exists in this organization.");
                }

                await set(userRef, { ...payload, createdAt: new Date().toISOString() });
                await set(
                    push(ref(rtdb, `organizations/${session.orgId}/accessAuditLogs`)),
                    buildUserAccessAuditEntry({
                        actorSession: session,
                        beforeUser: null,
                        afterUser: payload,
                        targetUserId: safeEmailKey,
                        action: 'user-created'
                    })
                );
                setUsers(prev => [...prev, { ...payload, id: safeEmailKey }]);
                alert("New user added successfully! Note: They must sign up with this exact email to authenticate via Firebase.");
            }
            setIsModalOpen(false);
        } catch (error) {
            alert("Error saving user: " + error.message);
        }
        setSaving(false);
    };

    const handleDeleteUser = async (userId, email) => {
        if (email === session.email) {
            return alert("You cannot delete your own admin account.");
        }
        if (window.confirm(`Are you sure you want to permanently remove access for ${email}?`)) {
            try {
                await remove(ref(rtdb, `organizations/${session.orgId}/users/${userId}`));
                setUsers(prev => prev.filter(u => u.id !== userId));
            } catch (error) {
                alert("Failed to delete user: " + error.message);
            }
        }
    };


    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-400 font-['Space_Grotesk'] tracking-widest text-sm uppercase">
                <i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i> Loading User Matrix...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-users-cog"></i>
                    </div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Access & Permissions</h1>
                </div>
                <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-transform active:scale-95 flex items-center gap-2 text-xs">
                    <i className="fas fa-user-plus"></i> Add New User
                </button>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">

                    {/* OVERVIEW STATS */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-blue-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Users</h3>
                            <div className="text-3xl font-black text-white">{users.length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Active Accounts</h3>
                            <div className="text-3xl font-black text-emerald-400">{users.filter(u => u.status === ACCOUNT_STATUS.ACTIVE).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-amber-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Pending Approval</h3>
                            <div className="text-3xl font-black text-amber-400">{users.filter(u => u.status === ACCOUNT_STATUS.PENDING).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-purple-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Global Admins</h3>
                            <div className="text-3xl font-black text-purple-400">{users.filter(u => ['Global Owner', 'Global Manager', 'Admin'].includes(u.role)).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Registered Sites</h3>
                            <div className="text-3xl font-black text-orange-400">{sites.length}</div>
                        </div>
                    </div>

                    {/* USERS TABLE */}
                    <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-list text-blue-500 mr-2"></i> System User Registry</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                    <tr>
                                        <th className="p-5 pl-8">User Details</th>
                                        <th className="p-5">System Role</th>
                                        <th className="p-5">Primary Site</th>
                                        <th className="p-5 text-center">Module Access</th>
                                        <th className="p-5">Status</th>
                                        <th className="p-5 pr-8 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                                    {users.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="p-5 pl-8">
                                                <div className="font-bold text-white text-base">{u.name}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">{u.email}</div>
                                            </td>
                                            <td className="p-5">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${['Global Owner', 'Global Manager', 'Admin'].includes(u.role) ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' : 'bg-blue-900/30 text-blue-400 border-blue-500/30'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="p-5 font-bold text-slate-300">
                                                {u.assignedSite || <span className="text-slate-600 italic">None</span>}
                                            </td>
                                            <td className="p-5 text-center">
                                                <span className="font-mono font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-emerald-400 shadow-inner">
                                                    {['Global Owner', 'Global Manager', 'Admin'].includes(u.role) ? 'ALL' : u.accessibleModules?.length || 0}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${u.status === ACCOUNT_STATUS.ACTIVE ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : u.status === ACCOUNT_STATUS.PENDING ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-red-500'}`}></div>
                                                    <span className="text-xs uppercase tracking-widest font-bold text-slate-400">{u.status}</span>
                                                </div>
                                            </td>
                                            <td className="p-5 pr-8 text-right flex justify-end gap-2">
                                                <button onClick={() => openModal(u)} className="bg-slate-800 hover:bg-blue-600 text-white w-9 h-9 rounded-xl transition-colors shadow flex items-center justify-center border border-slate-700" title="Edit Permissions">
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button onClick={() => handleDeleteUser(u.id, u.email)} className="bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white w-9 h-9 rounded-xl transition-colors shadow flex items-center justify-center border border-slate-700" title="Revoke Access">
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No users registered in this organization.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>

            {/* ===================================================================== */}
            {/* ADD / EDIT USER MODAL */}
            {/* ===================================================================== */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">

                        <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center flex-shrink-0">
                            <h2 className="text-2xl font-black text-blue-400 flex items-center gap-3">
                                <i className="fas fa-user-shield"></i> {editingUserId ? 'Edit User Permissions' : 'Grant New Access'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 transition-colors">
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto custom-scroll p-8">

                            {/* SECTION 1: CORE PROFILE */}
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-6">1. Core Profile</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Full Name *</label>
                                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 font-bold shadow-inner" placeholder="John Doe" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Email Address (Login ID) *</label>
                                    <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value.trim() })} disabled={!!editingUserId} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 font-mono shadow-inner disabled:opacity-50" placeholder="john@company.com" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">System Role *</label>
                                    <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-blue-400 outline-none focus:border-blue-500 font-bold shadow-inner">
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Account Status</label>
                                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 font-bold shadow-inner">
                                        <option value={ACCOUNT_STATUS.PENDING}>Pending Approval</option>
                                        <option value={ACCOUNT_STATUS.ACTIVE}>Active</option>
                                        <option value={ACCOUNT_STATUS.INACTIVE}>Inactive (Suspended)</option>
                                        <option value={ACCOUNT_STATUS.DELETED}>Deleted</option>
                                    </select>
                                    {editingUser?.status === ACCOUNT_STATUS.PENDING && (
                                        <p className="mt-2 text-[11px] text-amber-400 font-medium">
                                            This user is still pending approval. Saving with <strong>Active</strong> will approve the account and let them access assigned modules.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* SECTION 2: SITE ASSIGNMENTS */}
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-6">2. Site Allocation</h4>
                            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-10 shadow-inner">
                                <div className="mb-6">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Primary / Default Site</label>
                                    <select value={formData.assignedSite} onChange={e => setFormData({ ...formData, assignedSite: e.target.value })} className="w-full md:w-1/2 bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 shadow-inner font-bold">
                                        <option value="">Select Primary Site...</option>
                                        <option value="GLOBAL">GLOBAL (All Sites)</option>
                                        {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                    </select>
                                </div>

                                {formData.assignedSite !== 'GLOBAL' && (
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 tracking-widest">Additional Accessible Sites</label>
                                        <div className="flex flex-wrap gap-3">
                                            {sites.map(s => (
                                                <label key={s.code} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all cursor-pointer ${formData.accessibleSites.includes(s.code) ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                                    <input type="checkbox" className="hidden" checked={formData.accessibleSites.includes(s.code)} onChange={() => toggleArrayItem('accessibleSites', s.code)} />
                                                    <span className="text-xs font-bold">{s.name}</span>
                                                </label>
                                            ))}
                                            {sites.length === 0 && <span className="text-xs text-slate-500 italic">No sites created in the organization yet.</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* SECTION 3: MODULE PERMISSIONS */}
                            <div className="flex justify-between items-end border-b border-slate-800 pb-2 mb-6">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">3. Module Permissions</h4>
                                {['Global Owner', 'Global Manager', 'Admin'].includes(formData.role) ? (
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-900/30 px-3 py-1 rounded border border-emerald-500/30">Auto-Granted All Modules</span>
                                ) : (
                                    <div className="flex gap-3">
                                        <button type="button" onClick={selectAllModules} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-white transition-colors">Select All</button>
                                        <button type="button" onClick={clearAllModules} className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Clear All</button>
                                    </div>
                                )}
                            </div>

                            {['Global Owner', 'Global Manager', 'Admin'].includes(formData.role) ? (
                                <div className="bg-emerald-950/20 border border-emerald-900 rounded-2xl p-8 text-center shadow-inner">
                                    <i className="fas fa-unlock-alt text-4xl text-emerald-500 mb-3 opacity-50"></i>
                                    <p className="text-sm font-bold text-emerald-400">Administrators automatically have unrestricted read/write access to all enterprise modules.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-900/30 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                    {USER_ASSIGNABLE_MODULES.map((module) => {
                                        const isSelected = formData.accessibleModules.includes(module.id);
                                        return (
                                            <label key={module.id} className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-blue-900/20 border-blue-500 text-blue-300 shadow-inner' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}>
                                                <input type="checkbox" className="mt-0.5 accent-blue-500 w-4 h-4 cursor-pointer" checked={isSelected} onChange={() => toggleArrayItem('accessibleModules', module.id)} />
                                                <span className="text-xs font-bold uppercase tracking-wide leading-tight mt-[1px]">{module.label}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                            )}

                        </form>

                        <div className="p-6 border-t border-slate-800 bg-slate-950 flex justify-end gap-4 flex-shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition uppercase tracking-widest text-xs border border-slate-700 hover:bg-slate-800">
                                Cancel
                            </button>
                            <button onClick={handleSaveUser} disabled={saving} className="px-10 py-3 rounded-xl font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition flex items-center gap-2 uppercase tracking-widest text-xs disabled:opacity-50 active:scale-95">
                                {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                                {editingUserId ? 'Update Permissions' : 'Create User & Grant Access'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
