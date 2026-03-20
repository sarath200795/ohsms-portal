import React, { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
    browserSessionPersistence,
    getAuth,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { get, getDatabase, ref, update } from 'firebase/database';
import { auth } from '../config/firebase';

const VENDOR_APP_NAME = 'vendor-portal-app';
const VENDOR_SESSION_KEY = 'vendorSession';

const getVendorFirebase = () => {
    const existingApp = getApps().find(app => app.name === VENDOR_APP_NAME);
    const vendorApp = existingApp || initializeApp(auth.app.options, VENDOR_APP_NAME);
    return {
        vendorAuth: getAuth(vendorApp),
        vendorDb: getDatabase(vendorApp)
    };
};

const { vendorAuth, vendorDb } = getVendorFirebase();

const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

const safeArrWithKeys = (dataObj) => {
    if (!dataObj) return [];
    if (Array.isArray(dataObj)) return dataObj.filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) }));
    return Object.entries(dataObj).map(([k, v]) => ({ ...v, firebaseKey: k }));
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeVendorCode = (value) => String(value || '').trim().toUpperCase();
const buildVendorAuthErrorMessage = (error) => {
    const code = error?.code || '';

    if (code === 'auth/operation-not-allowed') {
        return 'Firebase Email/Password sign-in is disabled for this project. In Firebase Console, enable Authentication > Sign-in method > Email/Password.';
    }

    if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
    ) {
        return 'The portal email or vendor code is incorrect, or this vendor account still uses the older login setup. Ask your client admin to reprovision portal access so the vendor code becomes the login credential.';
    }

    if (code === 'auth/invalid-email') {
        return 'Please enter a valid portal email address.';
    }

    return 'Could not sign in: ' + (error?.message || 'Unknown error.');
};

const readVendorSession = () => {
    try {
        const raw = sessionStorage.getItem(VENDOR_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export default function VendorPortal() {
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginData, setLoginData] = useState({ email: '', vendorCode: '' });
    const [activeTab, setActiveTab] = useState('documentation');
    const [vendorSession, setVendorSession] = useState(null);
    const [vendor, setVendor] = useState(null);
    const [vendorIncidents, setVendorIncidents] = useState([]);
    const [vendorPermits, setVendorPermits] = useState([]);
    const [uploadingId, setUploadingId] = useState(null);
    const manualLoginRef = useRef(false);

    const resetPortalState = (clearForm = false) => {
        setIsAuthenticated(false);
        setVendor(null);
        setVendorIncidents([]);
        setVendorPermits([]);
        setVendorSession(null);
        setActiveTab('documentation');
        if (clearForm) {
            setLoginData({ email: '', vendorCode: '' });
        }
    };

    const buildVendorState = (firebaseKey, vendorData) => ({
        ...vendorData,
        firebaseKey,
        allocatedSites: safeArr(vendorData.allocatedSites),
        documents: safeArr(vendorData.documents),
        workers: safeArr(vendorData.workers).map(w => ({ ...w, additionalDocs: safeArr(w.additionalDocs) }))
    });

    const fetchVendorData = async ({ user, vendorCode = '', expectedOrgId = '', showAlerts = true }) => {
        setLoading(true);

        try {
            const cleanVendorCode = normalizeVendorCode(vendorCode);
            const cleanEmail = normalizeEmail(user?.email);

            if (!user?.uid || !cleanEmail) {
                throw new Error('No authenticated portal session found. Please sign in again.');
            }

            const userDirSnap = await get(ref(vendorDb, `userDirectory/${user.uid}`));
            if (!userDirSnap.exists()) {
                throw new Error('This account is not mapped to any organization. Ask your client admin to register your portal account first.');
            }

            const orgId = userDirSnap.val().orgId;
            if (expectedOrgId && expectedOrgId !== orgId) {
                throw new Error('This login belongs to a different organization than the saved portal session.');
            }

            const orgUserSnap = await get(ref(vendorDb, `organizations/${orgId}/users/${user.uid}`));
            if (!orgUserSnap.exists()) {
                throw new Error('Your authenticated account is missing from the organization directory.');
            }

            const orgUser = orgUserSnap.val();
            if (orgUser.status === 'Pending') {
                throw new Error('Your portal account is still pending approval. Ask your client admin to activate it.');
            }
            if (orgUser.status === 'Deleted' || orgUser.status === 'Inactive') {
                throw new Error('This portal account has been deactivated.');
            }

            const contractorSnap = await get(ref(vendorDb, `organizations/${orgId}/contractors`));
            if (!contractorSnap.exists()) {
                throw new Error('No contractor records were found for this organization.');
            }

            const matchedEntry = Object.entries(contractorSnap.val()).find(([, contractor]) => {
                const contractorEmail = normalizeEmail(contractor?.email);
                const contractorCode = normalizeVendorCode(contractor?.vendorCode);
                const contractorPortalUid = contractor?.portalUid || '';
                if (contractorPortalUid === user.uid) {
                    return true;
                }
                return contractorCode === cleanVendorCode && contractorEmail === cleanEmail;
            });

            if (!matchedEntry) {
                throw new Error('The signed-in account is not linked to any contractor profile. Ask your client admin to verify the portal email, vendor code, and portal access link.');
            }

            const [firebaseKey, vendorData] = matchedEntry;
            const normalizedVendor = buildVendorState(firebaseKey, vendorData);
            const resolvedVendorCode = normalizeVendorCode(vendorData.vendorCode || cleanVendorCode);

            let matchedIncidents = [];
            try {
                const incSnap = await get(ref(vendorDb, `organizations/${orgId}/incidents`));
                if (incSnap.exists()) {
                    matchedIncidents = safeArrWithKeys(incSnap.val())
                        .filter(i => i.contractorId === firebaseKey || (i.contractorName && i.contractorName.toLowerCase() === (vendorData.companyName || '').toLowerCase()))
                        .sort((a, b) => new Date(b.incidentDate || b.date || 0) - new Date(a.incidentDate || a.date || 0));
                }
            } catch (error) {
                console.warn('Incident fetch blocked or unavailable.', error);
            }

            let matchedPermits = [];
            try {
                const ptwSnap = await get(ref(vendorDb, `organizations/${orgId}/ptwRecords`));
                if (ptwSnap.exists()) {
                    matchedPermits = safeArrWithKeys(ptwSnap.val())
                        .filter(p => p.contractorId === firebaseKey || (p.contractorName && p.contractorName.toLowerCase() === (vendorData.companyName || '').toLowerCase()))
                        .sort((a, b) => new Date(b.createdAt || b.validFromDate || 0) - new Date(a.createdAt || a.validFromDate || 0));
                }
            } catch (error) {
                console.warn('PTW fetch blocked or unavailable.', error);
            }

            const nextSession = {
                email: cleanEmail,
                orgId,
                vendorCode: resolvedVendorCode,
                contractorId: firebaseKey
            };

            setVendor(normalizedVendor);
            setVendorIncidents(matchedIncidents);
            setVendorPermits(matchedPermits);
            setVendorSession(nextSession);
            setIsAuthenticated(true);
            setLoginData({
                email: cleanEmail,
                vendorCode: resolvedVendorCode
            });
            sessionStorage.setItem(VENDOR_SESSION_KEY, JSON.stringify(nextSession));

            if (showAlerts) {
                alert('Login successful.');
            }
        } catch (error) {
            console.error('Vendor portal login error:', error);
            sessionStorage.removeItem(VENDOR_SESSION_KEY);
            resetPortalState(false);
            await signOut(vendorAuth).catch(() => {});
            if (showAlerts) {
                alert(error.message || 'Failed to connect to the portal.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        let unsubscribe = () => {};

        const init = async () => {
            try {
                await setPersistence(vendorAuth, browserSessionPersistence);
            } catch (error) {
                console.warn('Vendor auth persistence setup failed.', error);
            }

            unsubscribe = onAuthStateChanged(vendorAuth, async (user) => {
                if (cancelled || manualLoginRef.current) return;

                const storedSession = readVendorSession();

                if (!user) {
                    sessionStorage.removeItem(VENDOR_SESSION_KEY);
                    resetPortalState(false);
                    setLoading(false);
                    return;
                }

                if (storedSession?.vendorCode && normalizeEmail(storedSession.email) === normalizeEmail(user.email)) {
                    await fetchVendorData({
                        user,
                        vendorCode: storedSession.vendorCode,
                        expectedOrgId: storedSession.orgId,
                        showAlerts: false
                    });
                    return;
                }

                await fetchVendorData({
                    user,
                    vendorCode: storedSession?.vendorCode || '',
                    expectedOrgId: storedSession?.orgId || '',
                    showAlerts: false
                });
            });

            if (cancelled) {
                unsubscribe();
            }
        };

        init();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();

        const cleanEmail = normalizeEmail(loginData.email);
        const cleanVendorCode = normalizeVendorCode(loginData.vendorCode);

        if (!cleanEmail || !cleanVendorCode) {
            alert('Please enter your email and vendor code.');
            return;
        }

        setLoading(true);

        try {
            manualLoginRef.current = true;
            const userCredential = await signInWithEmailAndPassword(vendorAuth, cleanEmail, cleanVendorCode);
            await fetchVendorData({
                user: userCredential.user,
                vendorCode: cleanVendorCode,
                showAlerts: true
            });
        } catch (error) {
            console.error('Vendor sign-in failed:', error);
            alert(buildVendorAuthErrorMessage(error));
        } finally {
            manualLoginRef.current = false;
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        sessionStorage.removeItem(VENDOR_SESSION_KEY);
        resetPortalState(true);
        setLoading(false);
        await signOut(vendorAuth).catch(() => {});
    };

    const getComplianceStatus = (docsData) => {
        const docs = safeArr(docsData);
        if (docs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct: 0 };

        const requiredDocs = docs.filter(d => d.isMandatory || d.status === 'Requested');
        const uploadedDocs = requiredDocs.filter(d => d.status === 'Uploaded' || d.status === 'Verified' || d.file);
        const pct = requiredDocs.length === 0 ? 100 : Math.round((uploadedDocs.length / requiredDocs.length) * 100);

        if (requiredDocs.length === 0) return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
        if (uploadedDocs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct };
        if (uploadedDocs.length < requiredDocs.length) return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        const hasExpired = uploadedDocs.some(d => d.expiryDate && new Date(d.expiryDate) < new Date());
        if (hasExpired) return { label: 'Partially Complied (Expired)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
    };

    const updateDatabase = async (updates) => {
        if (!vendorSession?.orgId || !vendor?.firebaseKey) {
            alert('Portal session expired. Please sign in again.');
            return false;
        }

        try {
            await update(ref(vendorDb, `organizations/${vendorSession.orgId}/contractors/${vendor.firebaseKey}`), updates);
            await fetchVendorData({
                user: vendorAuth.currentUser,
                vendorCode: vendorSession.vendorCode,
                expectedOrgId: vendorSession.orgId,
                showAlerts: false
            });
            return true;
        } catch (error) {
            alert('Upload failed: ' + error.message);
            return false;
        }
    };

    const handleCompanyDocUpload = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`comp-${docId}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedDocs = vendor.documents.map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
            await updateDatabase({ documents: updatedDocs });
        } catch {
            alert('Failed to read file.');
        }
        setUploadingId(null);
    };

    const handleWorkerCoreDocUpload = async (workerId, type, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`worker-${workerId}-${type}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedWorkers = vendor.workers.map(w => {
                if (w.id === workerId) {
                    const updatedWorker = { ...w };
                    if (type === 'med') {
                        updatedWorker.medDoc = b64;
                        updatedWorker.medDocName = file.name;
                    }
                    if (type === 'comp') {
                        updatedWorker.compDoc = b64;
                        updatedWorker.compDocName = file.name;
                    }
                    return updatedWorker;
                }
                return w;
            });
            await updateDatabase({ workers: updatedWorkers });
        } catch {
            alert('Failed to process document.');
        }
        setUploadingId(null);
    };

    const handleWorkerAdditionalDocUpload = async (workerId, docId, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert('File exceeds 2MB limit.');
        setUploadingId(`worker-add-${docId}`);

        try {
            const b64 = await fileToBase64(file);
            const updatedWorkers = vendor.workers.map(w => {
                if (w.id === workerId) {
                    const updatedDocs = safeArr(w.additionalDocs).map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
                    return { ...w, additionalDocs: updatedDocs };
                }
                return w;
            });
            await updateDatabase({ workers: updatedWorkers });
        } catch {
            alert('Failed to process document.');
        }
        setUploadingId(null);
    };

    if (loading && !isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center font-['Space_Grotesk'] text-slate-200">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Verifying Contractor Access</div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-['Space_Grotesk'] text-slate-200 p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="bg-slate-900/80 backdrop-blur-xl p-10 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full relative z-10 animate-in fade-in zoom-in duration-500">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                            <i className="fas fa-hard-hat text-2xl text-white"></i>
                        </div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-wider">Contractor Portal</h1>
                        <p className="text-xs text-slate-400 mt-2 tracking-widest uppercase">Secure Compliance Gateway</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Portal Email</label>
                            <input
                                type="email"
                                required
                                value={loginData.email}
                                onChange={e => setLoginData({ ...loginData, email: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 transition-colors shadow-inner"
                                placeholder="contractor@company.com"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Unique Vendor Code</label>
                            <input
                                type="text"
                                required
                                value={loginData.vendorCode}
                                onChange={e => setLoginData({ ...loginData, vendorCode: normalizeVendorCode(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 font-mono font-bold tracking-widest uppercase transition-colors shadow-inner"
                                placeholder="VEN-XXXXXX"
                            />
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-[11px] leading-relaxed text-slate-400">
                            Use the same email your client admin saved on your contractor profile and your vendor code. No separate password or sign-in link is needed.
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl uppercase tracking-widest text-sm transition-transform active:scale-95 shadow-lg shadow-indigo-900/50 mt-4 disabled:opacity-50"
                        >
                            {loading ? <i className="fas fa-circle-notch fa-spin"></i> : 'Access Vendor Portal'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const statusObj = getComplianceStatus(vendor.documents);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-['Space_Grotesk'] text-slate-200 relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none"></div>

            <header className="h-24 px-8 flex flex-col justify-center z-20 backdrop-blur-sm bg-slate-900/80 border-b border-slate-800 shadow-md gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
                            <i className="fas fa-building"></i>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white uppercase tracking-wide leading-tight">{vendor.companyName}</h1>
                            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Vendor ID: {vendor.vendorCode} | Org: {vendorSession?.orgId}</div>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="bg-slate-800 hover:bg-red-900/50 hover:text-red-400 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm flex items-center gap-2">
                        <i className="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll z-10">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl flex items-center gap-6">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl border-4 shadow-inner ${statusObj.pct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : statusObj.pct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>
                                {statusObj.pct}%
                            </div>
                            <div>
                                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Company Compliance</h3>
                                <div className={`text-sm font-black uppercase tracking-widest ${statusObj.color.split(' ')[0]}`}>{statusObj.label}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-1">{vendor.documents.filter(d => d.file || d.status === 'Uploaded').length} of {vendor.documents.length} Docs Uploaded</div>
                            </div>
                        </div>

                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2"><i className="fas fa-users mr-2"></i>Total Workforce</h3>
                            <div className="text-4xl font-black text-white">{vendor.workers.length}</div>
                            <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">Registered Personnel</div>
                        </div>

                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl">
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2"><i className="fas fa-info-circle mr-2"></i>Contract Details</h3>
                            <div className="space-y-2 mt-3">
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Service:</span> <span className="font-bold text-indigo-300">{vendor.serviceType}</span></div>
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Contact:</span> <span className="font-bold text-white">{vendor.contactPerson}</span></div>
                                <div className="flex justify-between text-xs"><span className="text-slate-500">Authorized Sites:</span> <span className="font-bold text-white">{vendor.allocatedSites.join(', ') || 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 border-b border-slate-800">
                        <button
                            onClick={() => setActiveTab('documentation')}
                            className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'documentation' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'}`}
                        >
                            <i className="fas fa-folder-open mr-2"></i> Documentation
                        </button>
                        <button
                            onClick={() => setActiveTab('activities')}
                            className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'activities' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'}`}
                        >
                            <i className="fas fa-hard-hat mr-2"></i> Activities & Safety
                        </button>
                    </div>

                    {activeTab === 'documentation' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-folder-open text-indigo-400"></i> Company Level Documents</h3>
                                    <p className="text-xs text-slate-400 mt-1">Please ensure all required organizational documents are uploaded and current.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendor.documents.map(doc => {
                                        const isExp = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                                        const isPending = !doc.file && doc.status !== 'Uploaded';
                                        const isUploading = uploadingId === `comp-${doc.id}`;

                                        return (
                                            <div key={doc.id} className={`p-4 rounded-2xl border shadow-sm transition-all ${isExp ? 'bg-red-950/20 border-red-500/30' : isPending ? 'bg-orange-950/10 border-orange-500/30' : 'bg-slate-950/80 border-slate-700 hover:border-slate-500'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="text-sm font-bold text-white leading-tight">{doc.name} {doc.isMandatory && <span className="text-[8px] bg-red-900/50 text-red-300 px-1.5 py-0.5 ml-2 rounded uppercase tracking-widest border border-red-500/30">Required</span>}</div>
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${doc.status === 'Uploaded' ? 'text-emerald-400' : 'text-orange-400'}`}>Status: {doc.status}</div>
                                                    </div>

                                                    {doc.file ? (
                                                        <div className="flex gap-2">
                                                            <a href={doc.file} target="_blank" rel="noreferrer" className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye mr-1"></i> View</a>
                                                            <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg px-3 py-1.5 transition-colors shadow-sm" title="Update Document">
                                                                <input type="file" onChange={(e) => handleCompanyDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                {isUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="relative overflow-hidden shadow-sm">
                                                            <input type="file" onChange={(e) => handleCompanyDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                            <div className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer">
                                                                {isUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-cloud-upload-alt"></i> Upload File</>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {doc.expiryDate && (
                                                    <div className={`text-[10px] font-mono mt-2 pt-2 border-t border-slate-800/50 ${isExp ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                                                        <i className="far fa-calendar-alt mr-1"></i> Expiry: {doc.expiryDate} {isExp && '(EXPIRED)'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-users-cog text-emerald-400"></i> Employee Roster & Documents</h3>
                                    <p className="text-xs text-slate-400 mt-1">Upload Medical Fitness (Form 33) and Competency Certificates for each worker.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendor.workers.map(w => {
                                        const isMedUploading = uploadingId === `worker-${w.id}-med`;
                                        const isCompUploading = uploadingId === `worker-${w.id}-comp`;

                                        return (
                                            <div key={w.id} className="p-5 rounded-2xl border border-slate-700 bg-slate-950/80 shadow-sm">
                                                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                                                    <div>
                                                        <div className="text-base font-bold text-white leading-tight">{w.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{w.role} | {w.competence}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Status</div>
                                                        {!w.inductionDate || w.inductionDate === 'Pending' ? (
                                                            <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest border border-orange-500/30 px-2 py-0.5 rounded bg-orange-900/20">Pending Induction</div>
                                                        ) : (
                                                            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-500/30 px-2 py-0.5 rounded bg-emerald-900/20">Inducted</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                                    <div className={`p-3 rounded-xl border ${w.medDoc ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-red-950/10 border-red-500/20'}`}>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex justify-between items-center">
                                                            <span>Medical Fitness</span>
                                                            {w.medDoc ? <i className="fas fa-check-circle text-emerald-500 text-sm"></i> : <i className="fas fa-times-circle text-red-500 text-sm"></i>}
                                                        </div>

                                                        {w.medDoc ? (
                                                            <div className="flex gap-2">
                                                                <a href={w.medDoc} target="_blank" rel="noreferrer" className="flex-1 text-center text-[10px] bg-emerald-900/30 text-emerald-400 hover:bg-emerald-600 hover:text-white py-2 rounded-lg border border-emerald-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye"></i> View</a>
                                                                <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg w-10 flex items-center justify-center transition-colors shadow-sm" title="Update">
                                                                    <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                    {isMedUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative overflow-hidden shadow-sm">
                                                                <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                <div className="bg-slate-800 border border-slate-600 hover:border-red-500 text-white w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer">
                                                                    {isMedUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-upload"></i> Upload File</>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className={`p-3 rounded-xl border ${w.compDoc ? 'bg-blue-950/10 border-blue-500/20' : 'bg-red-950/10 border-red-500/20'}`}>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex justify-between items-center">
                                                            <span>Competency Cert.</span>
                                                            {w.compDoc ? <i className="fas fa-check-circle text-blue-500 text-sm"></i> : <i className="fas fa-times-circle text-red-500 text-sm"></i>}
                                                        </div>

                                                        {w.compDoc ? (
                                                            <div className="flex gap-2">
                                                                <a href={w.compDoc} target="_blank" rel="noreferrer" className="flex-1 text-center text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white py-2 rounded-lg border border-blue-500/30 uppercase font-bold transition-colors shadow-sm"><i className="fas fa-eye"></i> View</a>
                                                                <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-lg w-10 flex items-center justify-center transition-colors shadow-sm" title="Update">
                                                                    <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                    {isCompUploading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-sync-alt text-[10px]"></i>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative overflow-hidden shadow-sm">
                                                                <input type="file" onChange={(e) => handleWorkerCoreDocUpload(w.id, 'comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                <div className="bg-slate-800 border border-slate-600 hover:border-red-500 text-white w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer">
                                                                    {isCompUploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading</> : <><i className="fas fa-upload"></i> Upload File</>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {w.additionalDocs.length > 0 && (
                                                    <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 mt-4">
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3"><i className="fas fa-folder-plus mr-1"></i> Client Specific Requests</div>
                                                        <div className="space-y-2">
                                                            {w.additionalDocs.map(doc => {
                                                                const isAddUploading = uploadingId === `worker-add-${doc.id}`;
                                                                return (
                                                                    <div key={doc.id} className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
                                                                        <span className="text-xs font-bold text-slate-300">{doc.name}</span>
                                                                        {doc.file ? (
                                                                            <div className="flex gap-2">
                                                                                <a href={doc.file} target="_blank" rel="noreferrer" className="text-[9px] bg-emerald-900/30 text-emerald-400 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded border border-emerald-500/30 uppercase font-bold transition-colors shadow-sm">View</a>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="relative overflow-hidden shadow-sm">
                                                                                <input type="file" onChange={(e) => handleWorkerAdditionalDocUpload(w.id, doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                                <div className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer">
                                                                                    {isAddUploading ? <i className="fas fa-spinner fa-spin"></i> : 'Upload'}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {vendor.workers.length === 0 && <div className="text-center text-slate-500 text-sm italic py-10">No employees assigned to this roster. Ask your client EHS to add them.</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'activities' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-orange-400 flex items-center gap-3"><i className="fas fa-clipboard-list"></i> Work Permits & Inspections</h3>
                                    <p className="text-xs text-slate-400 mt-1">Permits associated with your organization, including safety audit records.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendorPermits.map((p) => (
                                        <div key={p.firebaseKey} className={`p-4 rounded-xl border shadow-sm ${p.status === 'Closed' ? 'bg-slate-900 border-slate-700 opacity-70' : 'bg-orange-950/10 border-orange-500/30'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{p.permitType || p.typeId}</div>
                                                <div className="text-[10px] font-mono text-slate-500 font-bold bg-slate-950 px-2 py-1 rounded">{p.id || 'PTW'}</div>
                                            </div>
                                            <div className="text-sm text-white font-bold mb-1 leading-tight">{p.workDescription || p.description}</div>
                                            <div className="text-xs text-slate-400 mb-3"><i className="fas fa-location-dot mr-1"></i> {p.location} ({p.siteId})</div>

                                            {safeArr(p.nonCompliances).length > 0 && (
                                                <div className="mb-3 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
                                                    <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Logged Safety Violations</div>
                                                    <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                                                        {safeArr(p.nonCompliances).map((nc, i) => <li key={i}>{nc.desc || nc}</li>)}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center text-[10px] uppercase font-bold border-t border-slate-800 pt-3 mt-1">
                                                <span className="text-slate-400">{p.date || (p.validFromDate ? `${p.validFromDate}` : p.createdAt?.split('T')[0])}</span>
                                                <span className={p.status === 'Closed' ? 'text-emerald-500' : 'text-orange-500'}>{p.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {vendorPermits.length === 0 && <div className="text-center text-slate-500 text-sm italic mt-10">No active or historical permits on record.</div>}
                                </div>
                            </div>

                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50">
                                    <h3 className="text-xl font-bold text-red-400 flex items-center gap-3"><i className="fas fa-briefcase-medical"></i> Incident History</h3>
                                    <p className="text-xs text-slate-400 mt-1">Records of injuries or incidents involving your assigned workforce.</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-4 bg-slate-900/30">
                                    {vendorIncidents.map((inc) => (
                                        <div key={inc.firebaseKey} className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">{inc.incidentType || inc.type || 'Incident'}</div>
                                                <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{inc.incidentDate || inc.date || 'Unknown Date'}</div>
                                            </div>
                                            <div className="text-sm text-white font-bold mb-1 leading-tight">{inc.title || ''}</div>
                                            <div className="text-xs text-slate-300 leading-relaxed mb-3">{inc.description || inc.desc || 'No description provided.'}</div>

                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-t border-slate-800 pt-3">
                                                Affected Worker: <span className="text-white">{inc.affectedPersonName || 'Unknown'}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {vendorIncidents.length === 0 && (
                                        <div className="text-center text-emerald-500 font-bold mt-10 p-6 border-2 border-dashed border-emerald-500/30 rounded-2xl bg-emerald-950/10">
                                            <i className="fas fa-shield-check text-4xl mb-3 block"></i>
                                            Excellent! Zero Incidents Recorded.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
