import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/auth/index.js';
import { dbGet, dbSet, dbUpdate, dbRemove, dbPush, dbMultiUpdate } from '../services/db/index.js';
import { readOrgChildren } from '../utils/orgData';
import {
    GLOBAL_OWNER_ROLE,
    SITE_OWNER_ROLE,
    SUPPORTED_USER_ROLES,
    USER_ASSIGNABLE_MODULES,
    USER_ROLE,
    isGlobalOwnerRole,
    isSiteOwnerRole,
    normalizeRole,
    toCanonicalModuleIds
} from '../utils/permissions';
import { ACCOUNT_STATUS, readStoredSession, writeStoredSession } from '../utils/session';
import {
    buildPermissionRequestUpdates,
    buildUserAccessAuditEntry,
    normalizeUserAccessPayload,
    normalizeStoredUserRecord,
    validateUserAccessPayload
} from '../utils/userAccess';
// generateTemporaryPassword removed — password is now generated server-side in api/admin/users.js

const ROLES = SUPPORTED_USER_ROLES;
const USER_MANAGER_ROLES = [GLOBAL_OWNER_ROLE, SITE_OWNER_ROLE];
const normalizeJoinCode = (value) => value.toUpperCase().trim().replace(/[^A-Z0-9-]/g, '');
const generateJoinCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const rand = Array.from(bytes, b => chars[b % 36]).join('');
    return `JOIN-${rand}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
};

const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
};

const ensureCurrentAdminDirectory = async (sess) => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || !sess?.orgId || !isGlobalOwnerRole(sess.role)) return sess;

    const repairedSession = {
        ...sess,
        uid: currentUser.uid,
        email: currentUser.email || sess.email
    };

    try {
        const userPath = `organizations/${sess.orgId}/users/${currentUser.uid}`;
        const userData = await dbGet(userPath);

        if (!userData) {
            await dbSet(userPath, {
                name: sess.name || sess.user || currentUser.email?.split('@')[0] || 'Organization Admin',
                email: (currentUser.email || sess.email || '').toLowerCase().trim(),
                role: sess.role,
                assignedSite: sess.assignedSite || 'GLOBAL',
                accessibleSites: safeArr(sess.accessibleSites),
                accessibleModules: toCanonicalModuleIds(sess.accessibleModules),
                status: ACCOUNT_STATUS.ACTIVE,
                repairedAt: new Date().toISOString()
            });
        }

        const directoryData = await dbGet(`userDirectory/${currentUser.uid}`);
        if (!directoryData) {
            await dbSet(`userDirectory/${currentUser.uid}`, { orgId: sess.orgId });
        }

        if (repairedSession.uid !== sess.uid || repairedSession.email !== sess.email) {
            return writeStoredSession(repairedSession);
        }
    } catch (error) {
        console.warn('Admin directory repair skipped:', error);
    }

    return repairedSession;
};

export default function Users() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [users, setUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [permissionRequests, setPermissionRequests] = useState({});
    const [orgDetails, setOrgDetails] = useState({});
    const [provisionedCredential, setProvisionedCredential] = useState(null);

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
    const isGlobalOwner = isGlobalOwnerRole(session?.role);
    const isSiteOwner = isSiteOwnerRole(session?.role);
    const managedSiteCode = session?.assignedSite || '';

    const visibleSites = useMemo(() => {
        if (isGlobalOwner) return sites;
        return sites.filter((site) => site.code === managedSiteCode);
    }, [isGlobalOwner, managedSiteCode, sites]);

    const visibleUsers = useMemo(() => {
        if (isGlobalOwner) return users;
        return users.filter((user) => {
            const normalizedRole = normalizeRole(user.role);
            if (normalizedRole === GLOBAL_OWNER_ROLE) return false;
            return user.assignedSite === managedSiteCode || safeArr(user.accessibleSites).includes(managedSiteCode);
        });
    }, [isGlobalOwner, managedSiteCode, users]);

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) { navigate('/'); return; }

        if (!USER_MANAGER_ROLES.includes(sess.role)) {
            alert("Security Alert: Only Global Owners and Site Owners can access User Management.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const fetchData = async () => {
            try {
                const activeSession = await ensureCurrentAdminDirectory(sess);
                setSession(activeSession);
                const requestedChildren = ['details', 'sites', 'users', ...(isGlobalOwnerRole(activeSession.role) ? ['permissionRequests'] : [])];
                const data = await readOrgChildren(null, activeSession.orgId, requestedChildren, { session: activeSession });

                if (data.sites) {
                    setSites(Object.keys(data.sites).map(key => ({
                        code: data.sites[key].code || key,
                        name: data.sites[key].name || key
                    })));
                }

                if (data.users) {
                    const loadedUsers = Object.entries(data.users).map(([key, val]) => ({
                        id: key,
                        ...normalizeStoredUserRecord({
                            ...val,
                            accessibleSites: safeArr(val.accessibleSites)
                        })
                    }));
                    setUsers(loadedUsers);

                    if (isGlobalOwnerRole(activeSession.role)) {
                        const migrationUpdates = {};
                        Object.entries(data.users).forEach(([key, val]) => {
                            const normalized = normalizeStoredUserRecord({
                                ...val,
                                accessibleSites: safeArr(val.accessibleSites)
                            });

                            if (normalizeRole(val.role) !== String(val.role || '').trim()) {
                                migrationUpdates[`organizations/${activeSession.orgId}/users/${key}/role`] = normalized.role;
                            }

                            if (String(val.assignedSite || '') !== String(normalized.assignedSite || '')) {
                                migrationUpdates[`organizations/${activeSession.orgId}/users/${key}/assignedSite`] = normalized.assignedSite;
                            }

                            if (JSON.stringify(safeArr(val.accessibleSites)) !== JSON.stringify(normalized.accessibleSites)) {
                                migrationUpdates[`organizations/${activeSession.orgId}/users/${key}/accessibleSites`] = normalized.accessibleSites;
                            }

                            if (JSON.stringify(toCanonicalModuleIds(val.accessibleModules)) !== JSON.stringify(normalized.accessibleModules)) {
                                migrationUpdates[`organizations/${activeSession.orgId}/users/${key}/accessibleModules`] = normalized.accessibleModules;
                            }
                        });

                        if (Object.keys(migrationUpdates).length > 0) {
                            await dbMultiUpdate(migrationUpdates);
                        }
                    }
                }

                setOrgDetails(data.details || {});
                setPermissionRequests(data.permissionRequests || {});
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
                role: normalizeRole(user.role || USER_ROLE),
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
                role: USER_ROLE,
                assignedSite: isSiteOwner ? managedSiteCode : '',
                accessibleSites: [],
                accessibleModules: [],
                status: ACCOUNT_STATUS.ACTIVE
            });
        }
        setIsModalOpen(true);
    };

    const handleGenerateJoinCode = async () => {
        if (!session?.orgId || !isGlobalOwner) return;

        setSaving(true);
        try {
            const nextCode = generateJoinCode();
            const previousCode = normalizeJoinCode(orgDetails.joinCode || '');
            const updatedAt = new Date().toISOString();
            const updatedBy = session.name || session.email || 'Admin';

            const updates = {
                [`joinRegistry/${nextCode}`]: session.orgId,
                [`organizations/${session.orgId}/details/joinCode`]: nextCode,
                [`organizations/${session.orgId}/details/joinCodeUpdatedAt`]: updatedAt,
                [`organizations/${session.orgId}/details/joinCodeUpdatedBy`]: updatedBy
            };
            if (previousCode && previousCode !== nextCode) {
                updates[`joinRegistry/${previousCode}`] = null;
            }
            await dbMultiUpdate(updates);

            setOrgDetails(prev => ({
                ...prev,
                joinCode: nextCode,
                joinCodeUpdatedAt: updatedAt,
                joinCodeUpdatedBy: updatedBy
            }));
            alert('A new workspace join code has been generated. Share it only with users who should request access.');
        } catch (error) {
            alert(`Failed to generate join code: ${error.message}`);
        } finally {
            setSaving(false);
        }
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

    const writeAccessAuditLog = async (entry) => {
        try {
            await dbPush(`organizations/${session.orgId}/accessAuditLogs`, entry);
        } catch (error) {
            console.warn('Access audit log write failed after user save:', error);
        }
    };

    const syncPermissionRequests = async (requestUpdates) => {
        if (Object.keys(requestUpdates).length === 0) return;

        try {
            await dbUpdate(`organizations/${session.orgId}/permissionRequests`, requestUpdates);
            setPermissionRequests((prev) => {
                const next = { ...prev };
                Object.entries(requestUpdates).forEach(([path, value]) => {
                    const [requestId, field] = path.split('/');
                    next[requestId] = { ...(next[requestId] || {}), [field]: value };
                });
                return next;
            });
        } catch (error) {
            console.warn('Permission request status sync failed after user save:', error);
        }
    };

    const handleSaveUser = async (e) => {
        e?.preventDefault?.();
        setSaving(true);
        try {
            const scopedFormData = isSiteOwner
                ? {
                    ...formData,
                    assignedSite: managedSiteCode,
                    accessibleSites: formData.role === USER_ROLE
                        ? [managedSiteCode, ...safeArr(formData.accessibleSites).filter((site) => site === managedSiteCode)]
                        : [managedSiteCode]
                }
                : formData;
            const payload = normalizeUserAccessPayload(scopedFormData, { editingExistingUser: Boolean(editingUserId) });
            const validation = validateUserAccessPayload(payload);

            if (!validation.isValid) {
                setSaving(false);
                return alert(validation.errors.join('\n'));
            }

            if (isSiteOwner && payload.role === GLOBAL_OWNER_ROLE) {
                setSaving(false);
                return alert('Site Owners cannot assign the Global Owner role.');
            }

            if (isSiteOwner && payload.assignedSite !== managedSiteCode) {
                setSaving(false);
                return alert('Site Owners can only manage users for their own assigned site.');
            }

            // If editing existing user
            if (editingUserId) {
                if (isSiteOwner && (normalizeRole(editingUser?.role) === GLOBAL_OWNER_ROLE || editingUser?.assignedSite !== managedSiteCode)) {
                    setSaving(false);
                    return alert('You can only edit users assigned to your own site.');
                }

                const isApprovingPending = editingUser?.status === ACCOUNT_STATUS.PENDING && payload.status === ACCOUNT_STATUS.ACTIVE;
                const savePayload = isApprovingPending ? { ...payload, joinCode: null } : payload;

                // Defensive pre-flight — Firebase RTDB drops empty-string
                // values, so a savePayload with name:'' or email:'' would
                // fail the users.$uid.validate rule's hasChildren check
                // and bounce back as a confusing PERMISSION_DENIED.  Catch
                // it here with a precise message instead.
                if (!savePayload.name || !String(savePayload.name).trim()) {
                    setSaving(false);
                    return alert('Name is required — leaving it blank would cause Firebase to drop the field and reject the save with PERMISSION_DENIED.');
                }
                if (!savePayload.email || !String(savePayload.email).trim()) {
                    setSaving(false);
                    return alert('Email is required — leaving it blank would cause Firebase to drop the field and reject the save.');
                }
                if (!['Global Owner', 'Site Owner', 'User'].includes(savePayload.role)) {
                    setSaving(false);
                    return alert(`Invalid role "${savePayload.role}". Role must be one of: Global Owner, Site Owner, User.`);
                }
                if (savePayload.role === 'Site Owner' && (!savePayload.assignedSite || savePayload.assignedSite === 'GLOBAL')) {
                    setSaving(false);
                    return alert('Site Owner must have a non-GLOBAL primary site selected.');
                }

                try {
                    await dbUpdate(`organizations/${session.orgId}/users/${editingUserId}`, savePayload);
                } catch (writeErr) {
                    // Log the EXACT payload + caller context so the next
                    // PERMISSION_DENIED is diagnosable from the console.
                    console.error('[Users.handleSaveUser] dbUpdate rejected', {
                        path: `organizations/${session.orgId}/users/${editingUserId}`,
                        editingUser,
                        savePayload,
                        actorSession: { uid: session.uid, role: session.role, status: session.status, orgId: session.orgId },
                        error: writeErr,
                    });
                    throw writeErr;
                }

                const requestUpdates = buildPermissionRequestUpdates({
                    permissionRequests,
                    email: payload.email,
                    nextStatus: payload.status,
                    actorSession: session
                });

                if (isGlobalOwner) {
                    await syncPermissionRequests(requestUpdates);
                }

                await writeAccessAuditLog(
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
                const existingOrgUser = users.find((user) => String(user.email || '').toLowerCase() === payload.email);
                if (existingOrgUser) {
                    if (isSiteOwner && (normalizeRole(existingOrgUser.role) === GLOBAL_OWNER_ROLE || existingOrgUser.assignedSite !== managedSiteCode)) {
                        setSaving(false);
                        return alert('This email already belongs to a user outside your managed site.');
                    }

                    const { id: existingUserId, ...existingUserData } = existingOrgUser;
                    const mergedPayload = {
                        ...existingUserData,
                        ...payload,
                        vendorPortal: Boolean(existingOrgUser.vendorPortal),
                        portalLinkedContractorId: existingOrgUser.portalLinkedContractorId || '',
                        mustChangePassword: Boolean(existingOrgUser.mustChangePassword),
                        temporaryPasswordIssued: Boolean(existingOrgUser.temporaryPasswordIssued),
                        temporaryPasswordIssuedAt: existingOrgUser.temporaryPasswordIssuedAt || '',
                        passwordUpdatedAt: existingOrgUser.passwordUpdatedAt || '',
                        createdAt: existingOrgUser.createdAt || new Date().toISOString()
                    };

                    await dbUpdate(`organizations/${session.orgId}/users/${existingUserId}`, mergedPayload);

                    await writeAccessAuditLog(
                        buildUserAccessAuditEntry({
                            actorSession: session,
                            beforeUser: existingOrgUser,
                            afterUser: mergedPayload,
                            targetUserId: existingUserId,
                            action: existingOrgUser.vendorPortal ? 'user-access-linked-to-vendor' : 'user-access-updated'
                        })
                    );

                    setUsers((prev) => prev.map((user) => (
                        user.id === existingUserId ? { ...mergedPayload, id: existingUserId } : user
                    )));
                    alert(existingOrgUser.vendorPortal
                        ? 'Existing email found and linked successfully. This account now serves both the user directory and the contractor portal.'
                        : 'Existing user found. Access details were updated on the shared account instead of creating a duplicate login.');
                    setIsModalOpen(false);
                    setSaving(false);
                    return;
                }

                // Delegate to server-side Admin SDK endpoint — no client-side Auth manipulation
                let newUid = null;
                let temporaryPassword = null;

                try {
                    const result = await authService.createUser(payload.email, {
                        name: payload.name,
                        role: payload.role,
                        assignedSite: payload.assignedSite,
                        accessibleSites: payload.accessibleSites,
                        accessibleModules: payload.accessibleModules,
                        orgId: session.orgId,
                    });
                    newUid = result.uid;
                    temporaryPassword = result.temporaryPassword;
                } catch (provisionError) {
                    throw new Error('Could not create user: ' + provisionError.message);
                }

                // Build local payload (mirrors what the server wrote) for UI state
                const provisionedAt = new Date().toISOString();
                const newUserPayload = {
                    ...payload,
                    mustChangePassword: true,
                    temporaryPasswordIssued: true,
                    temporaryPasswordIssuedAt: provisionedAt,
                    provisionedBy: session.name || session.email || 'Admin',
                    createdAt: provisionedAt,
                };

                setUsers(prev => [...prev, { ...newUserPayload, id: newUid }]);
                setProvisionedCredential({
                    name: payload.name,
                    email: payload.email,
                    password: temporaryPassword,
                });

                await writeAccessAuditLog(
                    buildUserAccessAuditEntry({
                        actorSession: session,
                        beforeUser: null,
                        afterUser: payload,
                        targetUserId: newUid,
                        action: 'user-provisioned'
                    })
                );
                alert(`New user login created successfully.\n\nTemporary password for ${payload.email}:\n${temporaryPassword}\n\nAsk the user to sign in and change it immediately.`);
            }
            setIsModalOpen(false);
        } catch (error) {
            alert("Error saving user: " + error.message);
        }
        setSaving(false);
    };

    const handleDeleteUser = async (userId, email) => {
        if (!isGlobalOwner) {
            return alert('Only the Global Owner can permanently remove user access.');
        }
        if (email === session.email) {
            return alert("You cannot delete your own admin account.");
        }
        if (window.confirm(`Are you sure you want to permanently remove access for ${email}?`)) {
            try {
                // Server-side: deletes Firebase Auth account + all RTDB records atomically
                await authService.deleteUser(userId, session.orgId);
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
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">

                    {isGlobalOwner && (
                        <div className="mb-8 rounded-3xl border border-cyan-500/30 bg-cyan-950/20 p-6 shadow-2xl">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">Secure New User Onboarding</p>
                                    <h2 className="mt-2 text-2xl font-black text-white">Workspace Join Code</h2>
                                    <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
                                        New users can request access with this code. Rotate it anytime if it was shared too widely.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="rounded-2xl border border-cyan-400/30 bg-slate-950 px-5 py-4 text-center shadow-inner">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current Code</div>
                                        <div className="mt-1 font-mono text-lg font-black tracking-[0.22em] text-cyan-300">
                                            {orgDetails.joinCode || 'NOT GENERATED'}
                                        </div>
                                    </div>
                                    {orgDetails.joinCode && (
                                        <button
                                            type="button"
                                            onClick={() => navigator.clipboard?.writeText(orgDetails.joinCode)}
                                            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-300 transition hover:border-cyan-400 hover:text-white"
                                        >
                                            <i className="fas fa-copy mr-2"></i> Copy
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleGenerateJoinCode}
                                        disabled={saving}
                                        className="rounded-xl bg-cyan-600 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-500 disabled:opacity-50"
                                    >
                                        <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-key'} mr-2`}></i>
                                        {orgDetails.joinCode ? 'Rotate Code' : 'Generate Code'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {provisionedCredential && (
                        <div className="mb-8 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 p-6 shadow-2xl">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300">Temporary Login Created</p>
                                    <h2 className="mt-2 text-2xl font-black text-white">{provisionedCredential.name}</h2>
                                    <p className="mt-1 text-xs text-slate-400">{provisionedCredential.email}</p>
                                    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
                                        Share this password securely. It is shown only now, and the user should change it immediately after first sign-in.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="rounded-2xl border border-emerald-400/30 bg-slate-950 px-5 py-4 text-center shadow-inner">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Temporary Password</div>
                                        <div className="mt-1 font-mono text-lg font-black tracking-[0.12em] text-emerald-300">
                                            {provisionedCredential.password}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard?.writeText(provisionedCredential.password)}
                                        className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-300 transition hover:border-emerald-400 hover:text-white"
                                    >
                                        <i className="fas fa-copy mr-2"></i> Copy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setProvisionedCredential(null)}
                                        className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-400 transition hover:border-slate-500 hover:text-white"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* OVERVIEW STATS */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-blue-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">{isGlobalOwner ? 'Total Users' : 'Site Users'}</h3>
                            <div className="text-3xl font-black text-white">{visibleUsers.length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Active Accounts</h3>
                            <div className="text-3xl font-black text-emerald-400">{visibleUsers.filter(u => u.status === ACCOUNT_STATUS.ACTIVE).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-amber-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Pending Approval</h3>
                            <div className="text-3xl font-black text-amber-400">{visibleUsers.filter(u => u.status === ACCOUNT_STATUS.PENDING).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-purple-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">{isGlobalOwner ? 'Global Owners' : 'Site Owners'}</h3>
                            <div className="text-3xl font-black text-purple-400">{visibleUsers.filter(u => normalizeRole(u.role) === (isGlobalOwner ? GLOBAL_OWNER_ROLE : SITE_OWNER_ROLE)).length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">{isGlobalOwner ? 'Registered Sites' : 'Managed Site'}</h3>
                            <div className="text-3xl font-black text-orange-400">{visibleSites.length}</div>
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
                                    {visibleUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="p-5 pl-8">
                                                <div className="font-bold text-white text-base">{u.name}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">{u.email}</div>
                                            </td>
                                            <td className="p-5">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${normalizeRole(u.role) === GLOBAL_OWNER_ROLE ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' : normalizeRole(u.role) === SITE_OWNER_ROLE ? 'bg-blue-900/30 text-blue-400 border-blue-500/30' : 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30'}`}>
                                                    {normalizeRole(u.role)}
                                                </span>
                                            </td>
                                            <td className="p-5 font-bold text-slate-300">
                                                {u.assignedSite || <span className="text-slate-600 italic">None</span>}
                                            </td>
                                            <td className="p-5 text-center">
                                                <span className="font-mono font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-emerald-400 shadow-inner">
                                                    {normalizeRole(u.role) === GLOBAL_OWNER_ROLE ? 'ALL' : normalizeRole(u.role) === SITE_OWNER_ROLE ? 'SITE' : u.accessibleModules?.length || 0}
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
                                                {isGlobalOwner && (
                                                    <button onClick={() => handleDeleteUser(u.id, u.email)} className="bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white w-9 h-9 rounded-xl transition-colors shadow flex items-center justify-center border border-slate-700" title="Revoke Access">
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {visibleUsers.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No users available in this permission scope.</td></tr>}
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
                                    <select
                                        value={formData.role}
                                        onChange={e => setFormData({
                                            ...formData,
                                            role: e.target.value,
                                            assignedSite: e.target.value === GLOBAL_OWNER_ROLE ? 'GLOBAL' : (isSiteOwner ? managedSiteCode : formData.assignedSite),
                                            accessibleSites: e.target.value === USER_ROLE ? formData.accessibleSites : [],
                                            accessibleModules: e.target.value === USER_ROLE ? formData.accessibleModules : []
                                        })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-blue-400 outline-none focus:border-blue-500 font-bold shadow-inner"
                                    >
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <p className="mt-2 text-[11px] text-slate-500">
                                        {formData.role === GLOBAL_OWNER_ROLE
                                            ? 'Global Owner gets all sites and all modules automatically.'
                                            : formData.role === SITE_OWNER_ROLE
                                                ? 'Site Owner gets all modules for one or more assigned sites, with no access to the Sites module.'
                                                : 'User gets only the site and modules explicitly assigned below.'}
                                    </p>
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
                                    <select
                                        value={formData.role === GLOBAL_OWNER_ROLE ? 'GLOBAL' : formData.assignedSite}
                                        onChange={e => setFormData({ ...formData, assignedSite: e.target.value })}
                                        disabled={formData.role === GLOBAL_OWNER_ROLE || isSiteOwner}
                                        className="w-full md:w-1/2 bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 shadow-inner font-bold disabled:opacity-60"
                                    >
                                        {formData.role !== GLOBAL_OWNER_ROLE && <option value="">Select Primary Site...</option>}
                                        {formData.role === GLOBAL_OWNER_ROLE && <option value="GLOBAL">GLOBAL (All Sites)</option>}
                                        {(isSiteOwner ? visibleSites : sites).map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                    </select>
                                    {isSiteOwner && formData.role !== GLOBAL_OWNER_ROLE && (
                                        <p className="mt-2 text-[11px] text-slate-500">Site Owners can assign access only for their own site.</p>
                                    )}
                                </div>

                                {/*
                                  Multi-site picker:
                                  - USER role: existing behaviour — pick the extra sites this
                                    user can access in addition to their primary.
                                  - SITE OWNER role: now also picks the EXTRA sites this Site
                                    Owner can manage beyond their primary site. The primary
                                    site (from the dropdown above) is implicitly always
                                    included; any sites ticked here are added to
                                    accessibleSites at save time and recognised by
                                    normalizeSessionPermissions on every login.
                                  - GLOBAL OWNER: not shown — Global Owners have all sites.
                                  - Hidden if the form admin is themselves a Site Owner
                                    (they can only manage users within their own single site
                                    scope, so cross-site granting is not theirs to do).
                                */}
                                {(formData.role === USER_ROLE || formData.role === SITE_OWNER_ROLE) && formData.assignedSite !== 'GLOBAL' && !isSiteOwner && (
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-3 tracking-widest">
                                            {formData.role === SITE_OWNER_ROLE ? 'Additional Sites This Owner Manages' : 'Additional Accessible Sites'}
                                        </label>
                                        <div className="flex flex-wrap gap-3">
                                            {sites
                                                .filter((s) => s.code !== formData.assignedSite) // primary already implicit
                                                .map(s => (
                                                    <label key={s.code} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all cursor-pointer ${formData.accessibleSites.includes(s.code) ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                                        <input type="checkbox" className="hidden" checked={formData.accessibleSites.includes(s.code)} onChange={() => toggleArrayItem('accessibleSites', s.code)} />
                                                        <span className="text-xs font-bold">{s.name}</span>
                                                    </label>
                                                ))}
                                            {sites.length === 0 && <span className="text-xs text-slate-500 italic">No sites created in the organization yet.</span>}
                                            {sites.length > 0 && sites.length === 1 && <span className="text-xs text-slate-500 italic">Only one site exists — nothing else to grant.</span>}
                                        </div>
                                        {formData.role === SITE_OWNER_ROLE && (
                                            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                                                The Site Owner's <span className="font-bold text-slate-300">primary site</span> is set from the dropdown above. Tick any additional sites they should also be able to manage (view records, approve PTWs, run audits, etc.) for those sites.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* SECTION 3: MODULE PERMISSIONS */}
                            <div className="flex justify-between items-end border-b border-slate-800 pb-2 mb-6">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">3. Module Permissions</h4>
                                {formData.role !== USER_ROLE ? (
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-900/30 px-3 py-1 rounded border border-emerald-500/30">Auto-Granted All Modules</span>
                                ) : (
                                    <div className="flex gap-3">
                                        <button type="button" onClick={selectAllModules} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-white transition-colors">Select All</button>
                                        <button type="button" onClick={clearAllModules} className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Clear All</button>
                                    </div>
                                )}
                            </div>

                            {formData.role === GLOBAL_OWNER_ROLE ? (
                                <div className="bg-emerald-950/20 border border-emerald-900 rounded-2xl p-8 text-center shadow-inner">
                                    <i className="fas fa-unlock-alt text-4xl text-emerald-500 mb-3 opacity-50"></i>
                                    <p className="text-sm font-bold text-emerald-400">Global Owner automatically gets all enterprise modules and all sites.</p>
                                </div>
                            ) : formData.role === SITE_OWNER_ROLE ? (
                                <div className="bg-blue-950/20 border border-blue-900 rounded-2xl p-8 text-center shadow-inner">
                                    <i className="fas fa-shield-halved text-4xl text-blue-400 mb-3 opacity-60"></i>
                                    <p className="text-sm font-bold text-blue-300">Site Owner automatically gets all modules for the assigned site, with no access to the Sites module.</p>
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
