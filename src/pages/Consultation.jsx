import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

const MEETING_TYPES = [
    "HSE Committee Meeting",
    "Risk Assessment Review",
    "Policy Review",
    "Emergency Planning",
    "Management of Change",
    "Management Review"
];

// ==========================================
// SUB-COMPONENT: MEETING DETAIL MODAL
// ==========================================
const MeetingDetailModal = ({ meeting, onClose, onUpdateStatus, onPrint, session, permissions }) => {
    if (!meeting) return null;

    const currentUser = session?.name || session?.email || session?.user;

    const canEditStatus = (row) => {
        if (permissions.canEditCreate) return true; // Admins/Managers/Owners can edit all
        if (permissions.viewOnly && permissions.canEditOwnedActions) return row.owner === currentUser; // Users can edit their own assigned actions
        return false;
    };

    return (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in zoom-in-95 duration-300 print:hidden">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-3xl flex flex-col shadow-2xl relative min-h-[50vh] max-h-[90vh] overflow-hidden">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <div>
                        <h1 className="text-2xl font-bold uppercase text-teal-400 flex items-center gap-3"><i className="fas fa-handshake"></i> Minutes of Meeting</h1>
                        <p className="text-sm text-slate-400 mt-1 font-mono">Ref: {meeting.docId || meeting.id}</p>
                    </div>
                    <div className="text-right text-xs text-slate-400 font-bold uppercase tracking-widest bg-slate-950 p-3 rounded-xl border border-slate-700">
                        <p className="mb-1 text-teal-400"><i className="far fa-calendar-alt mr-1"></i> {meeting.date}</p>
                        <p><i className="fas fa-map-marker-alt mr-1"></i> Site: {meeting.siteId}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scroll space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                        <div><span className="text-slate-500 text-[10px] uppercase block tracking-widest mb-1">Type</span><span className="font-bold text-white">{meeting.type || 'Consultation'}</span></div>
                        <div><span className="text-slate-500 text-[10px] uppercase block tracking-widest mb-1">Date</span><span className="font-bold text-white">{meeting.date}</span></div>
                        <div><span className="text-slate-500 text-[10px] uppercase block tracking-widest mb-1">Time</span><span className="font-bold text-white">{meeting.time || 'N/A'}</span></div>
                        <div><span className="text-slate-500 text-[10px] uppercase block tracking-widest mb-1">Logged By</span><span className="font-bold text-teal-400">{meeting.createdBy}</span></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col">
                            <h3 className="text-xs uppercase text-teal-400 font-bold mb-3 tracking-widest"><i className="fas fa-bullseye mr-2"></i>Subject / Agenda</h3>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-sm flex-1 text-white shadow-inner font-medium leading-relaxed">{meeting.subject || meeting.agenda || 'N/A'}</div>
                        </div>
                        <div>
                            <h3 className="text-xs uppercase text-teal-400 font-bold mb-3 tracking-widest"><i className="fas fa-users mr-2"></i>Attendees</h3>
                            <div className="flex flex-wrap gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner min-h-[80px]">
                                {(meeting.attendees || []).map((a, i) => (
                                    <span key={i} className="bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-white shadow-sm">
                                        {a.name} <span className="text-slate-400 font-medium ml-1">({a.role})</span>
                                        {a.userId === 'External' && <span className="ml-2 text-[9px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-purple-500/30">EXT</span>}
                                    </span>
                                ))}
                                {(!meeting.attendees || meeting.attendees.length === 0) && <span className="text-slate-500 italic text-xs">No attendees recorded.</span>}
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs uppercase text-teal-400 font-bold mb-3 tracking-widest"><i className="fas fa-clipboard-list mr-2"></i>Pre-Requisites / Inputs</h3>
                        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 text-sm whitespace-pre-wrap text-slate-300 shadow-inner leading-relaxed min-h-[100px]">{meeting.preRequisites || 'None specified.'}</div>
                    </div>

                    <div>
                        <h3 className="text-xs uppercase text-teal-400 font-bold mb-3 tracking-widest"><i className="fas fa-comments mr-2"></i>Discussion Minutes</h3>
                        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 text-sm whitespace-pre-wrap text-white shadow-inner leading-relaxed min-h-[150px]">{meeting.minutes || 'No minutes recorded.'}</div>
                    </div>

                    <div>
                        <h3 className="text-xs uppercase text-teal-400 font-bold mb-4 border-b border-teal-500/20 pb-2 tracking-widest"><i className="fas fa-tasks mr-2"></i>Action Plan (CAPA)</h3>
                        <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-xl">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                    <tr>
                                        <th className="p-4 pl-6">Action Item Description</th>
                                        <th className="p-4">Owner</th>
                                        <th className="p-4">Due Date</th>
                                        <th className="p-4 pr-6 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/50 text-white">
                                    {(meeting.actions || []).map((row, idx) => {
                                        const isOverdue = row.status !== 'Closed' && row.due && new Date(row.due) < new Date();
                                        return (
                                            <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                                <td className="p-4 pl-6 font-medium whitespace-normal min-w-[250px]">{row.action}</td>
                                                <td className="p-4 font-bold text-blue-400">{row.owner}</td>
                                                <td className="p-4 font-mono text-xs text-slate-300">
                                                    {row.due}
                                                    {isOverdue && <span className="ml-2 px-2 py-0.5 bg-red-900/40 text-red-400 border border-red-500/30 rounded font-bold uppercase text-[9px] animate-pulse">Overdue</span>}
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <select
                                                        value={row.status || 'Open'}
                                                        onChange={e => onUpdateStatus(meeting.firebaseKey, idx, e.target.value)}
                                                        disabled={!canEditStatus(row)}
                                                        className={`text-xs px-3 py-1.5 rounded-lg font-bold outline-none border ${canEditStatus(row) ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${row.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' : row.status === 'In Progress' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}
                                                    >
                                                        <option value="Open">Open</option>
                                                        <option value="In Progress">In Progress</option>
                                                        <option value="Closed">Closed</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {(!meeting.actions || meeting.actions.length === 0) && <tr><td colSpan="4" className="p-8 text-center text-slate-500 italic">No CAPA actions assigned.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-800 flex justify-end gap-4 bg-slate-900 flex-shrink-0">
                    <button onClick={() => onPrint(meeting)} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-print"></i> Print Minutes</button>
                    <button onClick={onClose} className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-teal-900/50 transition-transform active:scale-95">Close Window</button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Consultation() {
    const navigate = useNavigate();
    const location = useLocation();

    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState(null);

    // RBAC & Filter State
    const [permissions, setPermissions] = useState({ viewOnly: false, canEditOwnedActions: false, canDelete: false, canEditCreate: false });
    const [filterSite, setFilterSite] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');

    // Calendar States
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear] = useState(new Date().getFullYear());
    const [calSiteFilter, setCalSiteFilter] = useState('All');

    // Core Data
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [meetings, setMeetings] = useState([]);

    // View States
    const [view, setView] = useState('list');
    const [printData, setPrintData] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form Data State
    const [formData, setFormData] = useState({
        id: '', firebaseKey: '', siteId: '', type: 'HSE Committee Meeting', subject: '',
        date: new Date().toISOString().split('T')[0], time: '', preRequisites: '', minutes: '',
        attendees: [], actions: []
    });

    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [externalName, setExternalName] = useState('');
    const [newActionLine, setNewActionLine] = useState({ action: '', owner: '', due: '' });

    // Load Session and Bulletproof Data
    useEffect(() => {
        try {
            const s = sessionStorage.getItem('isoSession');
            if (!s) { navigate('/'); return; }
            const sess = JSON.parse(s);

            const cleanRole = String(sess.role || '').trim();

            // 1. BULLETPROOF MODULE GUARD
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);

            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || (sess.accessibleModules || []).some(m => {
                const lowerM = String(m).toLowerCase();
                return lowerM.includes('consultation') || lowerM.includes('communication') || lowerM.includes('meeting');
            });

            if (!hasModuleAccess) {
                alert("Security Alert: You do not have permission to access the Consultation & Communication module.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            // 2. STRICT RBAC MATRIX
            const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(cleanRole);
            const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole);

            setPermissions({
                viewOnly: !canEditCr,
                canEditOwnedActions: true, // Let them update their own tasks in the modal
                canDelete: canDel,
                canEditCreate: canEditCr
            });

            // 3. SYNCHRONIZED SITE PERSISTENCE
            const params = new URLSearchParams(location.search);
            let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

            if (!isGlobalAdmin && ctxSite === 'All') {
                ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
            }

            setFilterSite(ctxSite);
            setCalSiteFilter(ctxSite);
            sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

            const pCategory = params.get('category');
            if (pCategory) {
                setFormData(prev => ({ ...prev, siteId: ctxSite === 'All' ? '' : ctxSite, type: pCategory, subject: params.get('subject') || prev.subject, minutes: params.get('minutes') || prev.minutes }));
                setView('form');
            } else {
                setFormData(prev => ({ ...prev, siteId: ctxSite === 'All' ? '' : ctxSite }));
            }

            const loadDatabases = async () => {
                try {
                    const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                    const snap = await get(dbRef);
                    if (snap.exists()) {
                        const orgData = snap.val();

                        if (orgData.sites) {
                            const parsedSites = Object.keys(orgData.sites).map(key => {
                                const sVal = orgData.sites[key];
                                return typeof sVal === 'object' ? { id: key, code: sVal.code || key, name: sVal.name || sVal.code || key } : { id: key, code: sVal, name: sVal };
                            });
                            setSites(parsedSites);
                        }

                        if (orgData.users) {
                            const allUsers = Object.keys(orgData.users).map(key => {
                                const uVal = orgData.users[key];
                                return typeof uVal === 'object' ? { id: key, name: uVal.name || uVal.email || "System Owner", role: uVal.role || "User", ...uVal } : { id: key, name: uVal || "System Owner", role: "User" };
                            }).filter(u => u.status !== 'Inactive' && u.status !== 'Deleted');
                            setUsers(allUsers);
                        }

                        if (orgData.consultations) {
                            setMeetings(Object.entries(orgData.consultations)
                                .map(([k, v]) => ({ firebaseKey: k, ...v }))
                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                            );
                        }
                    }
                } catch (err) { console.error("Database Error:", err); }
                finally { setIsLoading(false); }
            };

            loadDatabases();
        } catch (error) {
            console.error("Initialization Error", error);
            setIsLoading(false);
        }
    }, [navigate, location.search]);

    // ==========================================
    // 4. STRICT ROW-LEVEL SECURITY (RLS)
    // ==========================================
    const role = session?.role?.trim() || 'User';
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
        if (!isGlobalUser) {
            codes.delete('GLOBAL');
            codes.delete('All');
        }
        return codes;
    }, [session, isGlobalUser]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code) || allowedSiteCodes.has(s.id));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const handleSiteFilterChange = (e) => {
        const val = e.target.value;
        setFilterSite(val);
        sessionStorage.setItem('isoCurrentSite', val === 'All' ? 'GLOBAL' : val);
    };

    const handleCalSiteFilterChange = (e) => {
        const val = e.target.value;
        setCalSiteFilter(val);
        sessionStorage.setItem('isoCurrentSite', val === 'All' ? 'GLOBAL' : val);
    };

    const canViewRecord = (siteId) => isGlobalUser || siteId === 'Global' || siteId === 'GLOBAL' || allowedSiteCodes.has(siteId);

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData?.siteId) return true;
        return allowedSiteCodes.has(formData.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, formData?.siteId]);

    // --- Derived Filtering ---
    const siteUsers = useMemo(() => {
        return users.filter(u => {
            const isGlobalUsr = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
            const activeSiteId = formData.siteId || filterSite;
            const siteMatch = isGlobalUsr || !activeSiteId || activeSiteId === 'All' || u.assignedSite === activeSiteId || (u.accessibleSites && u.accessibleSites.includes(activeSiteId));
            return siteMatch;
        });
    }, [users, formData.siteId, filterSite]);

    const filteredList = useMemo(() => {
        return meetings.filter(m => {
            if (!canViewRecord(m.siteId)) return false; // RLS Hard Block
            const matchSite = filterSite === 'All' || m.siteId === filterSite;
            const matchCat = filterCategory === 'All' || m.type === filterCategory;
            return matchSite && matchCat;
        });
    }, [meetings, filterSite, filterCategory, canViewRecord]);


    // --- Handlers ---
    const handleAddAttendee = (type) => {
        if (!canEditForm) return;
        if (type === 'external') {
            if (!externalName.trim()) return alert("Enter external attendee name.");
            if ((formData.attendees || []).some(a => a.name.toLowerCase() === externalName.trim().toLowerCase())) return alert("Attendee is already in the list.");
            const newAttendee = { userId: 'External', name: externalName.trim(), role: 'External / Contractor', dept: 'N/A' };
            setFormData(prev => ({ ...prev, attendees: [...(prev.attendees || []), newAttendee] }));
            setExternalName('');
        } else {
            if (!selectedUserToAdd) return;
            const userObj = users.find(u => u.name === selectedUserToAdd || u.email === selectedUserToAdd);
            if ((formData.attendees || []).some(a => a.name === selectedUserToAdd)) return alert("Employee is already in the list.");
            const newAttendee = { userId: userObj ? userObj.id : 'Internal', name: userObj ? (userObj.name || userObj.email) : selectedUserToAdd, role: userObj ? (userObj.designation || userObj.role) : 'Employee', dept: userObj ? userObj.department : 'N/A' };
            setFormData(prev => ({ ...prev, attendees: [...(prev.attendees || []), newAttendee] }));
            setSelectedUserToAdd('');
        }
    };

    const removeAttendee = (i) => {
        if (!canEditForm) return;
        setFormData({ ...formData, attendees: formData.attendees.filter((_, x) => x !== i) });
    }

    const addAction = () => {
        if (!canEditForm) return;
        if (newActionLine.action && newActionLine.owner) {
            setFormData({ ...formData, actions: [...(formData.actions || []), { ...newActionLine, status: 'Open' }] });
            setNewActionLine({ action: '', owner: '', due: '' });
        } else {
            alert("Action Description and Owner are required.");
        }
    };

    const updateAction = (i, field, val) => {
        if (!canEditForm) return;
        const na = [...formData.actions]; na[i][field] = val; setFormData({ ...formData, actions: na });
    };
    const removeAction = (i) => {
        if (!canEditForm) return;
        setFormData({ ...formData, actions: formData.actions.filter((_, x) => x !== i) });
    }

    const saveRecord = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to edit records for this site.");
        if (!formData.siteId || !formData.subject) return alert("Site and Subject are required.");

        setSaving(true);
        const finalDocId = formData.docId || `MOM-${formData.siteId}-${Date.now().toString().slice(-4)}`;
        const payload = { ...formData, docId: finalDocId, timestamp: new Date().toISOString(), createdBy: session.name || session.email };

        try {
            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/consultations/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/consultations`), payload);
            }
            alert("Record saved successfully!");

            const dbRef = ref(rtdb, `organizations/${session.orgId}/consultations`);
            const snap = await get(dbRef);
            if (snap.exists()) {
                setMeetings(Object.entries(snap.val()).map(([k, v]) => ({ firebaseKey: k, ...v })).sort((a, b) => new Date(b.date) - new Date(a.date)));
            }
            setView('list');
        } catch (e) { alert("Save failed: " + e.message); }
        finally { setSaving(false); }
    };

    const deleteRecord = async (key) => {
        if (!permissions.canDelete) return alert("Security Error: You do not have permission to delete this record.");
        if (window.confirm("Delete this record permanently?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/consultations/${key}`));
            setMeetings(meetings.filter(m => m.firebaseKey !== key));
        }
    };

    const quickStatusUpdate = async (key, idx, newStatus) => {
        const meeting = meetings.find(m => m.firebaseKey === key);
        const actionRow = meeting.actions[idx];

        // Modal level RLS check
        if (!permissions.canEditCreate && actionRow.owner !== (session.name || session.email || session.user)) {
            return alert("Security Error: You can only update actions assigned to you.");
        }

        const updatedActions = [...meeting.actions];
        updatedActions[idx].status = newStatus;
        await update(ref(rtdb, `organizations/${session.orgId}/consultations/${key}`), { actions: updatedActions });
        setMeetings(meetings.map(m => m.firebaseKey === key ? { ...m, actions: updatedActions } : m));

        if (formData && formData.firebaseKey === key) {
            setFormData(prev => ({ ...prev, actions: updatedActions }));
        }
    };

    const triggerPrint = (dataObj) => { setPrintData(dataObj); setTimeout(() => window.print(), 800); };

    // --- Compliance Logic ---
    const pendingMeetings = useMemo(() => {
        if (!calSiteFilter || calSiteFilter === 'All') return [];
        const pending = [];
        const currentM = calMonth;
        const currentY = calYear;

        const siteConsultations = meetings.filter(c => c.siteId === calSiteFilter);

        const hasMeetingThisMonth = (type) => siteConsultations.some(c => {
            if (!c.date) return false;
            const parts = c.date.split('-');
            if (parts.length < 3) return false;
            return c.type === type && parseInt(parts[1], 10) - 1 === currentM && parseInt(parts[0], 10) === currentY;
        });

        const hasMeetingThisYear = (type) => siteConsultations.some(c => {
            if (!c.date) return false;
            const parts = c.date.split('-');
            if (parts.length < 1) return false;
            return c.type === type && parseInt(parts[0], 10) === currentY;
        });

        if (!hasMeetingThisMonth('HSE Committee Meeting')) pending.push('HSE Committee Meeting');
        if (!hasMeetingThisYear('Management Review')) pending.push('Management Review');
        if (!hasMeetingThisYear('Policy Review')) pending.push('Policy Review');
        if (!hasMeetingThisYear('Risk Assessment Review')) pending.push('Risk Assessment Review');
        if (!hasMeetingThisYear('Emergency Planning')) pending.push('Emergency Planning');

        return pending;
    }, [meetings, calSiteFilter, calMonth, calYear]);

    const getFreqLabel = (type) => {
        if (type === 'HSE Committee Meeting') return 'Monthly Requirement';
        if (type === 'Risk Assessment Review') return 'Annual Requirement';
        return 'Yearly Requirement';
    };

    const handleLogPending = (type) => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to log meetings.");
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const today = new Date();
        setFormData({
            id: '', firebaseKey: '', siteId: calSiteFilter, type: type,
            subject: `${type} _ ${monthNames[calMonth]} _ ${calYear}`,
            date: today.toISOString().split('T')[0], time: '', preRequisites: '', minutes: '',
            attendees: [], actions: []
        });
        setView('form');
    };

    if (isLoading || !session) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col font-['Space_Grotesk']">
            <i className="fas fa-circle-notch fa-spin text-4xl text-teal-500 mb-4"></i>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Registry Data...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            {/* APP HEADER - Hidden on Print */}
            <header className="app-ui h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-20 flex-shrink-0 print:hidden">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold shadow-lg shadow-teal-900/50"><i className="fas fa-comments"></i></div>
                    <h1 className="font-bold text-lg tracking-wide hidden md:block">Consultation & Meetings</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-teal-500/10 text-teal-400 px-2 py-1 rounded border border-teal-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="app-tabbar gap-1">
                    <button type="button" onClick={() => setView('list')} className={`app-tab ${view === 'list' || view === 'detail' ? 'app-tab-active' : ''}`}><i className="fas fa-database"></i> Dashboard</button>
                    <button type="button" onClick={() => setView('calendar')} className={`app-tab ${view === 'calendar' ? 'app-tab-active' : ''}`}><i className="fas fa-calendar-alt"></i> Calendar</button>
                    {permissions.canEditCreate && (
                        <button type="button" onClick={() => {
                            setFormData({ id: '', firebaseKey: '', siteId: (!isGlobalUser && visibleSites.length === 1) ? visibleSites[0].code : (filterSite !== 'All' ? filterSite : ''), type: 'HSE Committee Meeting', subject: '', date: new Date().toISOString().split('T')[0], time: '', preRequisites: '', minutes: '', attendees: [], actions: [] });
                            setView('form');
                        }} className={`app-tab app-tab-success ${view === 'form' ? 'app-tab-active' : ''}`}><i className="fas fa-plus"></i> New Meeting</button>
                    )}
                </div>
            </header>

            {/* MAIN APP CONTENT - Hidden on Print */}
            <main className="app-ui flex-1 overflow-y-auto p-8 custom-scroll relative z-10 print:hidden">

                {/* -------------------- VIEW: LIST / REPOSITORY -------------------- */}
                {view === 'list' && (
                    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Meeting Repository</h2>
                                <p className="text-sm text-slate-400">Formal logs of HSE Committees, Management Reviews, and Consultations.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl flex gap-2 shadow-inner">
                                    <select className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800 focus:border-teal-500" value={filterSite} onChange={handleSiteFilterChange}>
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {visibleSites.map((s, idx) => <option key={s.id || idx} value={s.code || s.id}>{s.name}</option>)}
                                    </select>
                                    <select className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800 focus:border-teal-500" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                                        <option value="All">All Categories</option>
                                        {MEETING_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <button type="button" onClick={() => {
                                    const dataToExport = filteredList.map(m => ({ ID: m.docId, Site: m.siteId, Date: m.date, Type: m.type, Subject: m.subject, Attendees: (m.attendees || []).length, Actions: (m.actions || []).length }));
                                    const ws = XLSX.utils.json_to_sheet(dataToExport); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Meetings"); XLSX.writeFile(wb, "Meetings_Export.xlsx");
                                }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow flex items-center gap-2 transition-colors border border-slate-600"><i className="fas fa-file-excel text-emerald-500"></i> Export</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-teal-500 shadow-xl flex justify-between items-center group hover:border-teal-400 transition-colors">
                                <div><p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Meetings Held</p><h3 className="text-4xl font-black text-white">{filteredList.length}</h3></div>
                                <div className="w-12 h-12 rounded-full bg-teal-900/20 flex items-center justify-center text-teal-500/50 group-hover:text-teal-400 transition-colors"><i className="fas fa-handshake text-2xl"></i></div>
                            </div>
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl flex justify-between items-center group hover:border-emerald-400 transition-colors">
                                <div><p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Actions Closed</p><h3 className="text-4xl font-black text-emerald-400">{filteredList.reduce((acc, curr) => acc + (curr.actions ? curr.actions.filter(a => a.status === 'Closed').length : 0), 0)}</h3></div>
                                <div className="w-12 h-12 rounded-full bg-emerald-900/20 flex items-center justify-center text-emerald-500/50 group-hover:text-emerald-400 transition-colors"><i className="fas fa-check-circle text-2xl"></i></div>
                            </div>
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl flex justify-between items-center group hover:border-yellow-400 transition-colors">
                                <div><p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Pending Actions</p><h3 className="text-4xl font-black text-yellow-400">{filteredList.reduce((acc, curr) => acc + (curr.actions ? curr.actions.filter(a => a.status !== 'Closed').length : 0), 0)}</h3></div>
                                <div className="w-12 h-12 rounded-full bg-yellow-900/20 flex items-center justify-center text-yellow-500/50 group-hover:text-yellow-400 transition-colors"><i className="fas fa-clock text-2xl"></i></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredList.map(m => {
                                const totalAct = m.actions ? m.actions.length : 0;
                                const closedAct = m.actions ? m.actions.filter(a => a.status === 'Closed').length : 0;
                                return (
                                    <div key={m.firebaseKey} className="glass-panel p-6 rounded-3xl border-t-4 border-teal-500 flex flex-col shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group" onClick={() => { setFormData(m); setView('detail'); }}>
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="font-mono text-[10px] font-bold text-teal-400 bg-teal-900/20 px-2 py-1 rounded-lg border border-teal-500/30">{m.docId}</span>
                                            <span className="text-[10px] bg-slate-900 text-slate-300 px-2 py-1 rounded-lg border border-slate-700 font-bold shadow-inner"><i className="far fa-calendar-alt mr-1"></i> {m.date}</span>
                                        </div>
                                        <h3 className="font-bold text-white text-lg mb-2 line-clamp-2 leading-tight group-hover:text-teal-400 transition-colors">{m.subject}</h3>
                                        <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-widest font-bold">{m.siteId} • {m.type}</p>
                                        <div className="mt-auto flex justify-between items-center border-t border-slate-800 pt-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800"><i className="fas fa-users text-purple-400 mr-1.5"></i> {(m.attendees || []).length}</span>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${totalAct > 0 && closedAct === totalAct ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
                                                    <i className="fas fa-tasks text-blue-400 mr-1.5"></i> CAPA: {closedAct}/{totalAct}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {permissions.canEditCreate ? (
                                                    <button type="button" onClick={e => { e.stopPropagation(); setFormData(m); setView('form'); }} className="text-blue-400 hover:text-white bg-slate-800 hover:bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-lg"><i className="fas fa-edit"></i></button>
                                                ) : (
                                                    <button type="button" onClick={e => { e.stopPropagation(); setFormData(m); setView('form'); }} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-lg"><i className="fas fa-eye"></i></button>
                                                )}

                                                {permissions.canDelete && <button type="button" onClick={e => { e.stopPropagation(); deleteRecord(m.firebaseKey); }} className="text-red-500 hover:text-white bg-slate-800 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-lg"><i className="fas fa-trash"></i></button>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredList.length === 0 && <div className="col-span-full text-center p-16 text-slate-500 italic text-lg border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/40 shadow-inner">No meeting records found matching your filters.</div>}
                        </div>
                    </div>
                )}

                {/* -------------------- VIEW: CALENDAR -------------------- */}
                {view === 'calendar' && (
                    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
                        <div className="flex justify-between items-center bg-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl">
                            <div className="flex items-center gap-4">
                                <label className="text-xs uppercase font-bold text-slate-400 tracking-widest">Compliance Site</label>
                                <select className="bg-slate-950 p-3 rounded-xl w-64 border border-slate-800 text-sm font-bold text-teal-400 outline-none focus:border-teal-500 shadow-inner transition-colors" value={calSiteFilter} onChange={handleCalSiteFilterChange}>
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map((s, idx) => <option key={s.id || idx} value={s.code || s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-950 rounded-xl p-1.5 border border-slate-800 shadow-inner">
                                <button type="button" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else { setCalMonth(m => m - 1) } }} className="px-4 py-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"><i className="fas fa-chevron-left"></i></button>
                                <span className="font-bold w-40 text-center text-white text-sm tracking-wide">{["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][calMonth]} {calYear}</span>
                                <button type="button" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else { setCalMonth(m => m + 1) } }} className="px-4 py-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"><i className="fas fa-chevron-right"></i></button>
                            </div>
                        </div>

                        {calSiteFilter && calSiteFilter !== 'All' ? (
                            <div className="mb-8">
                                <h3 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2"><i className="fas fa-exclamation-circle"></i> Mandatory Compliance Tracking</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {pendingMeetings.map((p, idx) => (
                                        <div key={idx} className="bg-slate-900 border border-orange-500/30 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-orange-500 transition-colors">
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-orange-400 to-red-500"></div>
                                            <div className="pl-3 mb-4">
                                                <div className="font-bold text-white text-base leading-tight mb-2 group-hover:text-orange-400 transition-colors">{p}</div>
                                                <div className="text-[10px] text-slate-400 bg-slate-950 font-bold uppercase tracking-widest inline-block px-2.5 py-1 rounded-lg border border-slate-800">
                                                    {getFreqLabel(p)} Due
                                                </div>
                                            </div>
                                            {permissions.canEditCreate && <button type="button" onClick={() => handleLogPending(p)} className="w-full bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/20 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm">Log Meeting Now</button>}
                                        </div>
                                    ))}
                                    {pendingMeetings.length === 0 && <div className="text-emerald-400 font-bold p-6 bg-emerald-900/10 rounded-2xl border border-emerald-500/20 w-full col-span-full flex items-center gap-3 shadow-inner"><i className="fas fa-check-circle text-3xl"></i> All mandated statutory meetings for this period are completely up to date!</div>}
                                </div>
                            </div>
                        ) : (
                            <div className="text-yellow-400 italic text-sm p-6 bg-yellow-900/10 rounded-2xl border border-yellow-500/20 w-full mb-8 shadow-inner font-bold text-center">Please select a specific facility site from the dropdown to view compliance status.</div>
                        )}

                        <div className="glass-panel p-8 rounded-3xl shadow-2xl border border-slate-700">
                            <div className="grid grid-cols-7 border-t border-l border-slate-800 rounded-2xl overflow-hidden bg-slate-900 shadow-2xl">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="p-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-b border-slate-800 bg-slate-950 shadow-inner">{day}</div>
                                ))}
                                {(() => {
                                    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                                    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
                                    const boxes = [];
                                    for (let i = 0; i < firstDayIndex; i++) boxes.push(<div key={`empty-${i}`} className="p-2 border-r border-b border-slate-800 bg-slate-900/30 min-h-[140px]"></div>);
                                    for (let d = 1; d <= daysInMonth; d++) {
                                        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                                        const dayMeetings = meetings.filter(c => {
                                            if (!canViewRecord(c.siteId)) return false;
                                            return c.date === dateStr && (calSiteFilter === 'All' || c.siteId === calSiteFilter);
                                        });

                                        boxes.push(
                                            <div key={d} className="p-3 border-r border-b border-slate-800 bg-slate-900 hover:bg-slate-800/80 transition-colors min-h-[140px] flex flex-col group">
                                                <span className="font-bold text-slate-500 block text-right mb-2 text-sm group-hover:text-slate-300 transition-colors">{d}</span>
                                                <div className="flex-1 space-y-2 overflow-y-auto custom-scroll pr-1">
                                                    {dayMeetings.map((m, i) => (
                                                        <div key={i} onClick={() => { setFormData(m); setView('detail'); }} className="text-[10px] font-bold bg-teal-500/10 text-teal-400 p-2 rounded-lg leading-tight border border-teal-500/30 cursor-pointer shadow-sm hover:bg-teal-600 hover:text-white transition-colors truncate uppercase tracking-wider" title={m.subject}>
                                                            {m.type}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return boxes;
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* -------------------- VIEW: FORM -------------------- */}
                {view === 'form' && (
                    <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500 pb-20">
                        <div className="glass-panel p-8 md:p-10 rounded-3xl border border-slate-700 shadow-2xl">
                            <div className="flex justify-between items-center mb-10 border-b border-slate-700 pb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-teal-400 flex items-center gap-4"><i className="fas fa-edit"></i> {formData.firebaseKey ? (canEditForm ? 'Edit Consultation Record' : 'View Consultation Record') : 'Log New Meeting'}</h2>
                                    <p className="text-sm text-slate-400 font-mono mt-2 ml-10">Ref: {formData.docId || 'DRAFT'}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setView('list')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors">Cancel</button>
                                    {formData.firebaseKey && <button type="button" onClick={() => triggerPrint(formData)} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-colors flex items-center gap-2"><i className="fas fa-print"></i> Print</button>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 bg-slate-900/60 p-8 rounded-2xl border border-slate-800 shadow-inner">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Facility / Site</label>
                                    <select className="w-full bg-slate-950 border border-slate-700 p-3.5 rounded-xl text-sm font-bold text-white focus:border-teal-500 outline-none shadow-inner transition-colors" value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value, attendees: [], actions: [] })} disabled={!canEditForm || (formData.firebaseKey && !isGlobalUser)}>
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Site...</option>}
                                        {visibleSites.map((s, idx) => <option key={s.id || idx} value={s.code || s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Meeting Category</label>
                                    <select className="w-full bg-slate-950 border border-slate-700 p-3.5 rounded-xl text-sm font-bold text-teal-400 focus:border-teal-500 outline-none shadow-inner transition-colors" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} disabled={!canEditForm}>
                                        {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Date</label>
                                        <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3.5 rounded-xl text-sm text-white outline-none shadow-inner font-mono transition-colors focus:border-teal-500" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Time</label>
                                        <input type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3.5 rounded-xl text-sm text-white outline-none shadow-inner font-mono transition-colors focus:border-teal-500" />
                                    </div>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Subject / Primary Agenda</label>
                                    <input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} placeholder="Main topic of discussion..." disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-4 rounded-xl text-base font-bold text-white focus:border-teal-500 outline-none shadow-inner transition-colors" />
                                </div>
                            </div>

                            <div className="mb-10 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-inner">
                                <label className="text-xs uppercase font-bold text-teal-400 tracking-widest mb-3 block flex items-center gap-2"><i className="fas fa-clipboard-list"></i> Pre-Requisites / Inputs</label>
                                <textarea value={formData.preRequisites} onChange={e => setFormData({ ...formData, preRequisites: e.target.value })} className="w-full bg-slate-950 border border-slate-700 p-5 rounded-xl text-sm font-medium text-slate-300 focus:border-teal-500 resize-none custom-scroll outline-none shadow-inner transition-colors leading-relaxed" placeholder="Record reference materials, incident IDs, or data inputs required for this meeting..." disabled={!canEditForm} rows="3"></textarea>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
                                {/* Attendees List */}
                                <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[500px]">
                                    <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
                                        <h3 className="font-bold text-purple-400 uppercase text-xs tracking-widest flex items-center gap-2"><i className="fas fa-users"></i> Attendance Roster <span className="bg-purple-900/50 text-white px-2 py-0.5 rounded border border-purple-500/50 text-[10px] ml-1">{(formData.attendees || []).length}</span></h3>
                                    </div>

                                    {canEditForm && (
                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 ml-1">Internal Staff</label>
                                                <div className="flex gap-2">
                                                    <select value={selectedUserToAdd} onChange={e => setSelectedUserToAdd(e.target.value)} className="w-full text-sm font-bold bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-purple-500 text-white outline-none shadow-inner transition-colors">
                                                        <option value="">Select Internal Employee...</option>
                                                        {siteUsers.map(u => (
                                                            <option key={u.id} value={u.name || u.email}>{u.name || u.email} ({u.role})</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={() => handleAddAttendee('internal')} className="bg-purple-600 hover:bg-purple-500 text-white px-5 rounded-xl font-bold shadow-lg shadow-purple-600/20 transition-transform active:scale-95 whitespace-nowrap"><i className="fas fa-plus"></i></button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 ml-1">External Contractor</label>
                                                <div className="flex gap-2">
                                                    <input value={externalName} onChange={e => setExternalName(e.target.value)} placeholder="Type Contractor Name..." className="w-full text-sm font-bold bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-pink-500 text-white outline-none shadow-inner transition-colors" />
                                                    <button type="button" onClick={() => handleAddAttendee('external')} className="bg-pink-600 hover:bg-pink-500 text-white px-5 rounded-xl font-bold shadow-lg shadow-pink-600/20 transition-transform active:scale-95 whitespace-nowrap"><i className="fas fa-plus"></i></button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto custom-scroll border border-slate-700 rounded-xl bg-slate-950 shadow-inner">
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-slate-900 uppercase font-bold text-slate-500 text-[10px] tracking-widest sticky top-0 shadow-sm border-b border-slate-800">
                                                <tr><th className="p-4 pl-5">Name</th><th className="p-4">Role</th><th className="p-4 w-10 text-center"></th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/80">
                                                {(formData.attendees || []).map((att, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                                        <td className="p-4 pl-5 font-bold text-white">
                                                            {att.name}
                                                            {att.userId === 'External' && <span className="ml-3 text-[9px] text-pink-400 bg-pink-900/30 px-2 py-1 rounded-lg font-bold uppercase tracking-widest border border-pink-500/30 shadow-sm">EXT</span>}
                                                        </td>
                                                        <td className="p-4 text-xs text-slate-400">{att.role}</td>
                                                        <td className="p-4 text-center">
                                                            {canEditForm && <button type="button" onClick={() => removeAttendee(idx)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-sm"><i className="fas fa-trash-alt"></i></button>}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!formData.attendees || formData.attendees.length === 0) && <tr><td colSpan="3" className="p-10 text-center text-slate-500 italic text-sm border-2 border-dashed border-slate-800 rounded-xl m-4">No attendees added to roster.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Minutes */}
                                <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[500px]">
                                    <label className="text-xs uppercase font-bold text-teal-400 tracking-widest mb-4 block border-b border-slate-800 pb-3 flex items-center gap-2"><i className="fas fa-comments"></i> Official Discussion Minutes</label>
                                    <textarea value={formData.minutes} onChange={e => setFormData({ ...formData, minutes: e.target.value })} className="w-full flex-1 bg-slate-950 border border-slate-700 p-5 rounded-xl text-sm font-medium text-white focus:border-teal-500 resize-none custom-scroll outline-none shadow-inner transition-colors leading-relaxed" placeholder="Record the general discussion points, topics covered, and any feedback received from participants here..." disabled={!canEditForm}></textarea>
                                </div>
                            </div>

                            {/* Action Plan (CAPA) */}
                            <div className="bg-slate-900/80 p-8 rounded-2xl border border-blue-500/30 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

                                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3 relative z-10">
                                    <label className="text-sm uppercase font-bold text-blue-400 tracking-widest flex items-center gap-2"><i className="fas fa-list-check"></i> Formulated Action Plan (CAPA)</label>
                                </div>

                                {canEditForm && (
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 bg-slate-950 p-5 rounded-xl border border-slate-700 shadow-inner relative z-10">
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Corrective Action Description</label>
                                            <input value={newActionLine.action} onChange={e => setNewActionLine({ ...newActionLine, action: e.target.value })} placeholder="What needs to be done?..." className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-sm text-white focus:border-blue-500 outline-none transition-colors" />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Owner / Assignee</label>
                                            <select value={newActionLine.owner} onChange={e => setNewActionLine({ ...newActionLine, owner: e.target.value })} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-sm font-bold text-blue-300 focus:border-blue-500 outline-none transition-colors">
                                                <option value="">Select...</option>
                                                {siteUsers.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>)}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2 flex items-end gap-3">
                                            <div className="flex-1">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Target Date</label>
                                                <input type="date" value={newActionLine.due} onChange={e => setNewActionLine({ ...newActionLine, due: e.target.value })} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-sm font-mono text-white focus:border-blue-500 outline-none transition-colors" />
                                            </div>
                                            <button type="button" onClick={addAction} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 font-bold uppercase tracking-widest text-xs h-[46px] flex items-center justify-center gap-2"><i className="fas fa-plus"></i> Add</button>
                                        </div>
                                    </div>
                                )}

                                <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-2xl relative z-10 custom-scroll max-h-[400px]">
                                    <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                                        <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-500 tracking-widest sticky top-0 z-20 shadow-sm border-b border-slate-800">
                                            <tr><th className="p-4 pl-6">Action Description</th><th className="p-4 w-1/4">Owner / Assignee</th><th className="p-4 w-40">Due Date</th><th className="p-4 w-40 text-center">Status</th><th className="p-4 w-16 text-center"></th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/80 bg-slate-950/80">
                                            {(formData.actions || []).map((c, i) => {
                                                const canEditRowStatus = canEditForm || (permissions.canEditOwnedActions && c.owner === (session.name || session.email || session.user));
                                                return (
                                                    <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                                        <td className="p-3 pl-6">
                                                            <input value={c.action} onChange={e => updateAction(i, 'action', e.target.value)} placeholder="Task details..." className="w-full bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 text-sm font-medium px-2 py-1.5 outline-none text-white transition-colors" disabled={!canEditForm} />
                                                        </td>
                                                        <td className="p-3">
                                                            <select value={c.owner} onChange={e => updateAction(i, 'owner', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-blue-300 outline-none focus:border-blue-500 transition-colors shadow-inner" disabled={!canEditForm}>
                                                                <option value="">Select...</option>
                                                                {siteUsers.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>)}
                                                            </select>
                                                        </td>
                                                        <td className="p-3">
                                                            <input type="date" value={c.due} onChange={e => updateAction(i, 'due', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-blue-500 transition-colors shadow-inner" disabled={!canEditForm} />
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <select value={c.status} onChange={e => updateAction(i, 'status', e.target.value)} disabled={!canEditRowStatus} className={`w-full text-xs font-bold tracking-widest uppercase rounded-lg p-2 outline-none border shadow-inner transition-colors ${canEditRowStatus ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${c.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30 focus:border-emerald-500' : c.status === 'In Progress' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30 focus:border-yellow-500' : 'bg-slate-900 text-slate-300 border-slate-700 focus:border-slate-500'}`}>
                                                                <option>Open</option><option>In Progress</option><option>Closed</option>
                                                            </select>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {canEditForm && <button type="button" onClick={() => removeAction(i)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-sm"><i className="fas fa-trash-alt"></i></button>}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                            {(!formData.actions || formData.actions.length === 0) && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic text-sm">No follow-up actions have been defined for this meeting.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {canEditForm && (
                                <div className="flex justify-end mt-10 border-t border-slate-800 pt-8">
                                    <button type="button" onClick={saveRecord} disabled={saving} className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg shadow-teal-900/50 transition-transform transform active:scale-95 flex items-center gap-3 uppercase tracking-widest text-sm">
                                        {saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-save text-lg"></i>} Save Official Record
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DETAIL VIEW MODAL */}
                {view === 'detail' && formData && (
                    <MeetingDetailModal meeting={formData} onClose={() => setView('list')} onUpdateStatus={quickStatusUpdate} onPrint={triggerPrint} session={session} permissions={permissions} />
                )}
            </main>

            {/* PRINT OVERLAY */}
            {printData && (
                <div className="hidden print:block p-10 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1 tracking-widest uppercase">ISO 45001 OHSMS - FORMAL RECORD</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Consultation & Meeting Minutes</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Ref ID: {printData.docId || printData.id}</p>
                            <p className="text-sm font-bold uppercase mt-1">Date Printed: {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="mb-8 border border-black p-6 bg-gray-50">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Meeting Details</h2>
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Type:</td><td className="w-[35%] py-2 border-b border-gray-300 text-lg font-bold">{printData.type}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Time:</td><td className="w-[35%] py-2 border-b border-gray-300 font-mono">{printData.time || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site/Location:</td><td className="w-[35%] py-2 border-b border-gray-300">{printData.siteId}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Date:</td><td className="w-[35%] py-2 border-b border-gray-300 font-mono font-bold">{printData.date}</td>
                                </tr>
                                <tr>
                                    <td className="font-bold py-3 align-top border-none">Subject/Agenda:</td><td colSpan="3" className="py-3 text-lg font-bold border-none leading-tight">{printData.subject}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-8 border border-black p-6">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Inputs / Pre-Requisites</h2>
                        <div className="text-sm whitespace-pre-wrap pl-4 border-l-4 border-gray-300 min-h-[50px] leading-relaxed">{printData.preRequisites || 'None specified.'}</div>
                    </div>

                    <div className="mb-8 border border-black p-6 page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3. Attendance Roster</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-3 text-center w-12">#</th>
                                    <th className="border border-black p-3 text-left w-2/5">Full Name</th>
                                    <th className="border border-black p-3 text-left w-1/3">Role / Affiliation</th>
                                    <th className="border border-black p-3 text-center">Signature</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printData.attendees || []).map((a, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-3 text-center font-bold">{i + 1}</td>
                                        <td className="border border-black p-3 font-bold">{a.name} {a.userId === 'External' ? '(Contractor/EXT)' : ''}</td>
                                        <td className="border border-black p-3">{a.role}</td>
                                        <td className="border border-black p-3 h-12"></td>
                                    </tr>
                                ))}
                                {(!printData.attendees || printData.attendees.length === 0) && <tr><td colSpan="4" className="border border-black p-6 text-center italic text-gray-500">No attendees recorded.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-8 border border-black p-6 page-break">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">4. Discussion Minutes</h2>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed text-justify">{printData.minutes || 'No formal minutes documented.'}</div>
                    </div>

                    <div className="mb-8 border border-black p-6 page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">5. Agreed Action Plan (CAPA)</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-3 text-center w-12">#</th>
                                    <th className="border border-black p-3 text-left">Action Item Description</th>
                                    <th className="border border-black p-3 text-left w-1/4">Owner Assignee</th>
                                    <th className="border border-black p-3 text-center w-32">Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printData.actions || []).map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="border border-black p-3 text-center font-bold">{idx + 1}</td>
                                        <td className="border border-black p-3 font-medium">{row.action}</td>
                                        <td className="border border-black p-3 font-bold">{row.owner}</td>
                                        <td className="border border-black p-3 text-center font-mono">{row.due}</td>
                                    </tr>
                                ))}
                                {(!printData.actions || printData.actions.length === 0) && (
                                    <tr><td colSpan="4" className="border border-black p-6 text-center italic text-gray-500">No follow-up actions assigned during this meeting.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                        <tbody>
                            <tr>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Prepared By / Chairperson</td>
                                <td className="w-[10%] border-none"></td>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Site Manager / EHS Lead Approval</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
}
