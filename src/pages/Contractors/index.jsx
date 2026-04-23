import React, { useEffect, useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, push, ref, set, update } from 'firebase/database';
import { auth, rtdb } from '../../config/firebase';
import { fileToBase64, safeArr } from '../../utils/helpers';
import { getMandatoryDocs, GOODS_TYPES, SERVICE_TYPES } from '../../utils/constants';
import { readOrgChildren } from '../../utils/orgData';
import ContractorBuilder from './components/ContractorBuilder';
import ContractorRegistry from './components/ContractorRegistry';
import WorkersView from './components/WorkersView';
import DeploymentsView from './components/DeploymentsView';
import AddWorkerModal from './components/AddWorkerModal';
import CompanyProfileModal from './components/CompanyProfileModal';
import PortalSuccessModal from './components/PortalSuccessModal';
import WorkerProfileModal from './components/WorkerProfileModal';
import {
    createEmptyVendorForm,
    generateVendorCode,
    getComplianceStatus,
    normalizeEmail,
    normalizeVendorCode,
    parseContractors
} from './utils';
import { hasAccessibleModule, normalizeSessionPermissions } from '../../utils/permissions';

export default function Contractors() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('register');

    const [contractors, setContractors] = useState([]);
    const [orgUsers, setOrgUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [workerCompanyFilter, setWorkerCompanyFilter] = useState('All');
    const [deploymentCompanyFilter, setDeploymentCompanyFilter] = useState('All');
    const [saving, setSaving] = useState(false);

    const [globalTrainings, setGlobalTrainings] = useState([]);
    const [globalPermits, setGlobalPermits] = useState([]);
    const [globalIncidents, setGlobalIncidents] = useState([]);

    const [formData, setFormData] = useState(createEmptyVendorForm());
    const [addWorkerData, setAddWorkerData] = useState({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });

    const [activeVendor, setActiveVendor] = useState(null);
    const [editingVendor, setEditingVendor] = useState(null);
    const [activeWorker, setActiveWorker] = useState(null);
    const [modalType, setModalType] = useState(null);
    const [newDocReq, setNewDocReq] = useState('');
    const [newWorkerDocReq, setNewWorkerDocReq] = useState('');
    const [portalProvisioning, setPortalProvisioning] = useState(false);
    const [portalSuccess, setPortalSuccess] = useState(null);

    useEffect(() => {
        const rawSession = sessionStorage.getItem('isoSession');
        if (!rawSession) {
            navigate('/');
            return;
        }

        const sess = normalizeSessionPermissions(JSON.parse(rawSession));
        sessionStorage.setItem('isoSession', JSON.stringify(sess));
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || hasAccessibleModule(sess.accessibleModules, 'Contractors');

        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission.');
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && ctxSite === 'All') {
            ctxSite = sess.assignedSite;
        }

        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const data = await readOrgChildren(rtdb, sess.orgId, ['contractors', 'users', 'sites', 'trainings', 'ptwRecords', 'incidents']);

                if (data.contractors) setContractors(parseContractors(data.contractors));
                if (data.users) {
                    setOrgUsers(
                        Object.entries(data.users).map(([key, value]) => ({
                            firebaseKey: key,
                            ...value,
                            email: normalizeEmail(value.email)
                        }))
                    );
                }
                if (data.sites) {
                    setSites(
                        Object.keys(data.sites).map((key) => ({
                            code: data.sites[key].code || key,
                            name: data.sites[key].name || key
                        }))
                    );
                }
                if (data.trainings) setGlobalTrainings(safeArr(data.trainings));
                if (data.ptwRecords) {
                    const permitArr = Array.isArray(data.ptwRecords)
                        ? data.ptwRecords.filter(Boolean).map((value, index) => ({ ...value, firebaseKey: String(index) }))
                        : Object.entries(data.ptwRecords).map(([key, value]) => ({ ...value, firebaseKey: key }));
                    setGlobalPermits(permitArr);
                }
                if (data.incidents) {
                    const incidentArr = Array.isArray(data.incidents)
                        ? data.incidents.filter(Boolean).map((value, index) => ({ ...value, firebaseKey: String(index) }))
                        : Object.entries(data.incidents).map(([key, value]) => ({ ...value, firebaseKey: key }));
                    setGlobalIncidents(incidentArr);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [location.search, navigate]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    useEffect(() => {
        if (session && !canEdit && view === 'register') {
            setView('companies');
        }
    }, [canEdit, session, view]);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...safeArr(session.accessibleSites)].filter(Boolean));
        if (!isGlobalUser) {
            codes.delete('GLOBAL');
            codes.delete('All');
        }
        return codes;
    }, [isGlobalUser, session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [allowedSiteCodes, isGlobalUser, sites]);

    const visibleContractors = useMemo(() => {
        return contractors.filter((contractor) => {
            if (
                !isGlobalUser &&
                session?.assignedSite !== 'GLOBAL' &&
                !safeArr(contractor.allocatedSites).includes(session?.assignedSite) &&
                !safeArr(session?.accessibleSites).some((site) => safeArr(contractor.allocatedSites).includes(site))
            ) {
                return false;
            }

            if (siteFilter !== 'All' && !safeArr(contractor.allocatedSites).includes(siteFilter)) {
                return false;
            }

            return true;
        });
    }, [contractors, isGlobalUser, session, siteFilter]);

    const allWorkers = useMemo(() => {
        const list = [];

        visibleContractors.forEach((contractor) => {
            if (workerCompanyFilter !== 'All' && contractor.firebaseKey !== workerCompanyFilter) return;

            safeArr(contractor.workers).forEach((worker) => {
                const workerName = typeof worker.name === 'string' ? worker.name.toLowerCase() : '';
                if (!workerName) return;

                const trainingsList = globalTrainings.filter((training) =>
                    safeArr(training.attendees).some((attendee) => {
                        const attendeeName = typeof attendee === 'object' ? (attendee.name || '') : (typeof attendee === 'string' ? attendee : '');
                        return attendeeName.toLowerCase() === workerName && (typeof attendee === 'object' ? attendee.status === 'Attended' : true);
                    })
                );

                const injuriesList = [
                    ...safeArr(contractor.incidents)
                        .filter((incident) => typeof incident.desc === 'string' && incident.desc.toLowerCase().includes(workerName))
                        .map((incident) => ({
                            type: incident.type || 'Incident',
                            date: incident.date,
                            desc: incident.desc || incident.description,
                            id: incident.id || 'Local'
                        })),
                    ...globalIncidents
                        .filter((incident) => incident.affectedPersonType === 'Contractor' && incident.affectedPersonId === worker.id)
                        .map((incident) => ({
                            type: incident.incidentType || incident.type,
                            date: incident.incidentDate || incident.date,
                            desc: incident.description || incident.title,
                            id: incident.id || incident.firebaseKey
                        }))
                ];

                list.push({
                    ...worker,
                    companyName: contractor.companyName || 'Unknown Vendor',
                    contractorId: contractor.firebaseKey,
                    trainingsList,
                    injuriesList
                });
            });
        });

        return list.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
    }, [globalIncidents, globalTrainings, visibleContractors, workerCompanyFilter]);

    const refreshContractors = async () => {
        const snap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
        if (snap.exists()) {
            setContractors(parseContractors(snap.val()));
        }
    };

    const toggleAllocatedSite = (code) => {
        setFormData((prev) => {
            const exists = prev.allocatedSites.includes(code);
            return {
                ...prev,
                allocatedSites: exists ? prev.allocatedSites.filter((site) => site !== code) : [...prev.allocatedSites, code]
            };
        });
    };

    const handleServiceTypeChange = (event) => {
        const type = event.target.value;
        setFormData((prev) => ({ ...prev, serviceType: type, documents: getMandatoryDocs(type, prev.goodsType) }));
    };

    const handleGoodsTypeChange = (event) => {
        const goodsType = event.target.value;
        setFormData((prev) => ({ ...prev, goodsType, documents: getMandatoryDocs(prev.serviceType, goodsType) }));
    };

    const saveVendorRegistration = async () => {
        if (!formData.companyName || formData.allocatedSites.length === 0 || !normalizeEmail(formData.email)) {
            alert('Company Name, vendor email, and at least one Site Allocation are required.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                ...formData,
                email: normalizeEmail(formData.email),
                siteId: formData.allocatedSites[0],
                updatedBy: session.name,
                lastUpdated: new Date().toISOString()
            };

            if (!payload.createdAt) {
                payload.createdAt = new Date().toISOString();
                payload.vendorCode = generateVendorCode();
            }

            const keyToUpdate = formData.firebaseKey;
            delete payload.firebaseKey;

            if (keyToUpdate) await update(ref(rtdb, `organizations/${session.orgId}/contractors/${keyToUpdate}`), payload);
            else await push(ref(rtdb, `organizations/${session.orgId}/contractors`), payload);

            alert('Vendor Registered/Updated Successfully!');
            await refreshContractors();
            setView('companies');
            setFormData(createEmptyVendorForm());
        } catch (error) {
            alert('Save failed: ' + error.message);
        }
        setSaving(false);
    };

    const updateVendorDB = async (vendorKey, payload) => {
        try {
            await update(ref(rtdb, `organizations/${session.orgId}/contractors/${vendorKey}`), payload);

            setContractors((prev) => prev.map((contractor) => {
                if (contractor.firebaseKey !== vendorKey) return contractor;
                return {
                    ...contractor,
                    ...payload,
                    allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(contractor.allocatedSites),
                    documents: payload.documents ? safeArr(payload.documents) : safeArr(contractor.documents),
                    workers: payload.workers ? safeArr(payload.workers) : safeArr(contractor.workers)
                };
            }));

            if (activeVendor && activeVendor.firebaseKey === vendorKey) {
                setActiveVendor((prev) => ({
                    ...prev,
                    ...payload,
                    allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(prev.allocatedSites),
                    documents: payload.documents ? safeArr(payload.documents) : safeArr(prev.documents),
                    workers: payload.workers ? safeArr(payload.workers) : safeArr(prev.workers)
                }));
            }
        } catch {
            alert('Failed to update database.');
        }
    };

    const saveCompanyProfileEdit = () => {
        if (!editingVendor.companyName || safeArr(editingVendor.allocatedSites).length === 0 || !normalizeEmail(editingVendor.email)) {
            alert('Company Name, portal email, and Site Allocation are required.');
            return;
        }

        updateVendorDB(activeVendor.firebaseKey, {
            companyName: editingVendor.companyName,
            allocatedSites: editingVendor.allocatedSites,
            siteId: editingVendor.allocatedSites[0],
            serviceType: editingVendor.serviceType,
            goodsType: editingVendor.goodsType || '',
            contactPerson: editingVendor.contactPerson,
            phone: editingVendor.phone,
            email: normalizeEmail(editingVendor.email),
            updatedBy: session.name,
            lastUpdated: new Date().toISOString()
        });
        setEditingVendor(null);
    };

    const provisionVendorPortalAccess = async () => {
        if (!isGlobalUser) {
            alert('Only Global Admins can provision contractor portal accounts.');
            return;
        }
        if (!activeVendor?.firebaseKey) {
            alert('Vendor profile is not loaded.');
            return;
        }

        const vendorEmail = normalizeEmail(activeVendor.email);
        if (!vendorEmail) {
            alert('Add a contractor email address before provisioning portal access.');
            return;
        }

        const vendorCode = normalizeVendorCode(activeVendor.vendorCode);
        if (!vendorCode) {
            alert('Vendor code is missing on this contractor profile.');
            return;
        }

        setPortalProvisioning(true);

        try {
            const nowIso = new Date().toISOString();
            const allocatedSites = safeArr(activeVendor.allocatedSites);
            const primarySite = allocatedSites[0] || activeVendor.siteId || 'GLOBAL';
            const existingOrgUser = orgUsers.find((user) => (
                (activeVendor.portalUid && user.firebaseKey === activeVendor.portalUid) ||
                normalizeEmail(user.email) === vendorEmail
            ) && user.status !== 'Deleted');

            let portalUid = activeVendor.portalUid || existingOrgUser?.firebaseKey || '';
            let createdPortalAuthUser = false;
            let provisioningWarning = '';
            const baseUserPayload = {
                name: activeVendor.contactPerson || activeVendor.companyName || 'Vendor Portal User',
                email: vendorEmail,
                role: existingOrgUser?.role || 'User',
                status: 'Active',
                assignedSite: existingOrgUser?.assignedSite || primarySite,
                accessibleSites: Array.from(new Set([...(safeArr(existingOrgUser?.accessibleSites)), ...allocatedSites].filter(Boolean))),
                accessibleModules: safeArr(existingOrgUser?.accessibleModules),
                vendorPortal: true,
                portalLinkedContractorId: activeVendor.firebaseKey,
                updatedBy: session.email,
                updatedAt: nowIso
            };

            const tempAppName = `vendorPortal-${Date.now()}`;
            const tempApp = initializeApp(auth.app.options, tempAppName);
            const tempAuth = getAuth(tempApp);

            try {
                if (portalUid) {
                    try {
                        const existingCredential = await signInWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                        portalUid = existingCredential.user.uid;
                    } catch (authError) {
                        const authCode = authError?.code || '';
                        if (
                            authCode === 'auth/invalid-credential' ||
                            authCode === 'auth/invalid-login-credentials' ||
                            authCode === 'auth/user-not-found' ||
                            authCode === 'auth/wrong-password'
                        ) {
                            provisioningWarning = 'Portal access was linked to an existing organization user, but that Firebase Auth account is still using an older password. The vendor will not be able to log in with the vendor code until that auth user password is reset to the vendor code in Firebase Authentication.';
                        } else {
                            throw authError;
                        }
                    }
                } else {
                    try {
                        const existingCredential = await signInWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                        portalUid = existingCredential.user.uid;
                    } catch (authError) {
                        const authCode = authError?.code || '';
                        if (
                            authCode === 'auth/invalid-credential' ||
                            authCode === 'auth/invalid-login-credentials' ||
                            authCode === 'auth/user-not-found' ||
                            authCode === 'auth/wrong-password'
                        ) {
                            try {
                                const userCredential = await createUserWithEmailAndPassword(tempAuth, vendorEmail, vendorCode);
                                portalUid = userCredential.user.uid;
                                createdPortalAuthUser = true;
                            } catch (createError) {
                                if (createError?.code === 'auth/email-already-in-use') {
                                    throw new Error('This email already exists in Firebase Authentication but is not linked to a contractor org user yet. Create or locate the matching org user first, then reprovision, or reset/delete that Firebase Auth user so the vendor code can be used as the login credential.');
                                }
                                throw createError;
                            }
                        } else {
                            throw authError;
                        }
                    }
                }
            } finally {
                await signOut(tempAuth).catch(() => {});
            }

            if (!portalUid) {
                throw new Error('Unable to provision a vendor portal auth account for this contractor.');
            }

            await update(ref(rtdb, `organizations/${session.orgId}/users/${portalUid}`), baseUserPayload);

            try {
                await set(ref(rtdb, `userDirectory/${portalUid}`), { orgId: session.orgId });
            } catch (dirError) {
                const dirMessage = String(dirError?.message || '').toLowerCase();
                if (dirMessage.includes('permission denied')) {
                    if (!createdPortalAuthUser && existingOrgUser) {
                        provisioningWarning = provisioningWarning || 'Portal access was linked to an existing organization user. The userDirectory record could not be recreated from this screen, which usually means it already exists. If login still fails, verify that userDirectory points this user to the correct organization.';
                    } else {
                        throw new Error('This vendor email is already tied to a Firebase Auth account that cannot be linked automatically from this screen. If that account already belongs to another org or already has a userDirectory entry, please fix it in Firebase first and then provision again.');
                    }
                } else {
                    throw dirError;
                }
            }

            await updateVendorDB(activeVendor.firebaseKey, {
                email: vendorEmail,
                portalUid,
                portalProvisionedAt: nowIso,
                portalProvisionedBy: session.email
            });

            setOrgUsers((prev) => {
                const nextUser = { firebaseKey: portalUid, ...baseUserPayload };
                const index = prev.findIndex((user) => user.firebaseKey === portalUid);
                if (index === -1) return [...prev, nextUser];
                const updated = [...prev];
                updated[index] = { ...updated[index], ...nextUser };
                return updated;
            });

            setPortalSuccess({
                companyName: activeVendor.companyName,
                email: vendorEmail,
                vendorCode,
                linkedExisting: !createdPortalAuthUser,
                warning: provisioningWarning
            });
        } catch (error) {
            alert('Portal provisioning failed: ' + error.message);
        } finally {
            setPortalProvisioning(false);
        }
    };

    const handleDocUpload = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        const base64 = await fileToBase64(file);
        const updatedDocs = safeArr(activeVendor.documents).map((doc) => (
            doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
        ));
        updateVendorDB(activeVendor.firebaseKey, { documents: updatedDocs });
    };

    const requestAdditionalDoc = () => {
        if (!newDocReq) return;
        const newDoc = { id: Date.now().toString(), type: 'Requested', name: newDocReq, isMandatory: false, status: 'Requested' };
        updateVendorDB(activeVendor.firebaseKey, { documents: [...safeArr(activeVendor.documents), newDoc] });
        setNewDocReq('');
    };

    const submitNewWorker = async () => {
        if (!addWorkerData.contractorId || !addWorkerData.name || !addWorkerData.competence || !addWorkerData.deployedSite) {
            alert('Company, Name, Competence, and Deployed Site are required.');
            return;
        }

        const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${addWorkerData.contractorId}`);
        const snap = await get(vendorRef);
        if (snap.exists()) {
            const vendorData = snap.val();
            const newWorkerObj = {
                id: Date.now().toString(),
                name: addWorkerData.name,
                role: addWorkerData.role,
                competence: addWorkerData.competence,
                deployedSite: addWorkerData.deployedSite,
                inductionDate: 'Pending',
                additionalDocs: []
            };

            await update(vendorRef, { workers: [...safeArr(vendorData.workers), newWorkerObj] });
            await refreshContractors();
            setModalType(null);
            setAddWorkerData({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });
            alert('Worker added successfully! You can now upload their documents from their profile.');
        }
    };

    const removeWorkerFromProfile = (contractorId, workerId) => {
        if (!window.confirm('Remove this worker from the roster permanently?')) return;
        const vendor = contractors.find((contractor) => contractor.firebaseKey === contractorId);
        if (!vendor) return;
        updateVendorDB(contractorId, { workers: safeArr(vendor.workers).filter((worker) => worker.id !== workerId) });
    };

    const quickUpdateWorkerDeployment = (contractorId, workerId, newSite) => {
        const vendor = contractors.find((contractor) => contractor.firebaseKey === contractorId);
        if (!vendor) return;
        const updatedWorkers = safeArr(vendor.workers).map((worker) => (
            worker.id === workerId ? { ...worker, deployedSite: newSite } : worker
        ));
        updateVendorDB(contractorId, { workers: updatedWorkers });
    };

    const handleWorkerCoreDocUpload = async (type, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
            const snap = await get(vendorRef);
            if (!snap.exists()) return;

            const updatedWorkers = safeArr(snap.val().workers).map((worker) => {
                if (worker.id !== activeWorker.id) return worker;
                const updatedWorker = { ...worker };
                if (type === 'med') {
                    updatedWorker.medDoc = base64;
                    updatedWorker.medDocName = file.name;
                }
                if (type === 'comp') {
                    updatedWorker.compDoc = base64;
                    updatedWorker.compDocName = file.name;
                }
                return updatedWorker;
            });

            await update(vendorRef, { workers: updatedWorkers });
            await refreshContractors();

            setActiveWorker((prev) => {
                const updated = { ...prev };
                if (type === 'med') {
                    updated.medDoc = base64;
                    updated.medDocName = file.name;
                }
                if (type === 'comp') {
                    updated.compDoc = base64;
                    updated.compDocName = file.name;
                }
                return updated;
            });
        } catch {
            alert('Failed to process document.');
        }
    };

    const requestAdditionalWorkerDoc = async () => {
        if (!newWorkerDocReq) return;

        const newDoc = { id: Date.now().toString(), name: newWorkerDocReq, status: 'Requested', file: null };
        const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
        const snap = await get(vendorRef);
        if (!snap.exists()) return;

        const updatedWorkers = safeArr(snap.val().workers).map((worker) => (
            worker.id === activeWorker.id ? { ...worker, additionalDocs: [...safeArr(worker.additionalDocs), newDoc] } : worker
        ));

        await update(vendorRef, { workers: updatedWorkers });
        await refreshContractors();
        setActiveWorker((prev) => ({ ...prev, additionalDocs: [...safeArr(prev.additionalDocs), newDoc] }));
        setNewWorkerDocReq('');
    };

    const uploadAdditionalWorkerDoc = async (docId, file) => {
        if (!file) return;
        if (file.size > 2097152) {
            alert('File exceeds 2MB limit.');
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
            const snap = await get(vendorRef);
            if (!snap.exists()) return;

            const updatedWorkers = safeArr(snap.val().workers).map((worker) => {
                if (worker.id !== activeWorker.id) return worker;
                return {
                    ...worker,
                    additionalDocs: safeArr(worker.additionalDocs).map((doc) => (
                        doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
                    ))
                };
            });

            await update(vendorRef, { workers: updatedWorkers });
            await refreshContractors();
            setActiveWorker((prev) => ({
                ...prev,
                additionalDocs: safeArr(prev.additionalDocs).map((doc) => (
                    doc.id === docId ? { ...doc, file: base64, fileName: file.name, status: 'Uploaded' } : doc
                ))
            }));
        } catch {
            alert('Upload failed.');
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase">
                <div className="w-8 h-8 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin mr-3"></div>
                Loading Contractors...
            </div>
        );
    }

    return (
        <>
            <style>
                {`
                    @media print {
                        body, html, #root { height: auto !important; overflow: visible !important; background-color: white !important; color: black !important; }
                        .print-content { position: relative !important; width: 100% !important; height: auto !important; overflow: visible !important; display: block !important; }
                    }
                `}
            </style>

            <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible print:bg-white print:text-black">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0 print:hidden"></div>

                <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0 print:hidden">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-hard-hat"></i></div>
                        <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Contractor Safety</h1>
                    </div>
                    <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1 overflow-x-auto custom-scroll">
                        {canEdit && <button type="button" onClick={() => { setFormData(createEmptyVendorForm()); setView('register'); }} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'register' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-user-plus mr-1"></i> Register Vendor</button>}
                        <button type="button" onClick={() => setView('companies')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'companies' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-building mr-1"></i> Company Profiles</button>
                        <button type="button" onClick={() => setView('workers')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'workers' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-id-badge mr-1"></i> Worker Profiles</button>
                        <button type="button" onClick={() => setView('deployments')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'deployments' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-map-marker-alt mr-1"></i> Deployments</button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full print:hidden">
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
                        {view !== 'register' && (
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{view === 'companies' ? 'Vendor Master Data' : view === 'deployments' ? 'Site Deployments Dashboard' : 'Contractor Personnel Registry'}</h2>
                                    <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">ISO 45001 Compliance Tracking</p>
                                </div>
                                <select value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); sessionStorage.setItem('isoCurrentSite', event.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner w-full md:w-auto">
                                    {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                                </select>
                            </div>
                        )}

                        {view === 'register' && (
                            <ContractorBuilder
                                canEdit={canEdit}
                                formData={formData}
                                goodsTypes={GOODS_TYPES}
                                onGoodsTypeChange={handleGoodsTypeChange}
                                onServiceTypeChange={handleServiceTypeChange}
                                onSubmit={saveVendorRegistration}
                                saving={saving}
                                serviceTypes={SERVICE_TYPES}
                                setFormData={setFormData}
                                toggleAllocatedSite={toggleAllocatedSite}
                                visibleSites={visibleSites}
                            />
                        )}

                        {view === 'companies' && (
                            <ContractorRegistry
                                contractors={visibleContractors}
                                getComplianceStatus={getComplianceStatus}
                                onViewProfile={(vendor) => {
                                    setActiveVendor(vendor);
                                    setModalType('company_profile');
                                }}
                            />
                        )}

                        {view === 'workers' && (
                            <WorkersView
                                allWorkers={allWorkers}
                                canEdit={canEdit}
                                contractors={visibleContractors}
                                onAddWorker={() => setModalType('add_worker')}
                                onViewWorker={(worker) => {
                                    setActiveWorker(worker);
                                    setModalType('worker_profile');
                                }}
                                setWorkerCompanyFilter={setWorkerCompanyFilter}
                                workerCompanyFilter={workerCompanyFilter}
                            />
                        )}

                        {view === 'deployments' && (
                            <DeploymentsView
                                canEdit={canEdit}
                                contractors={visibleContractors}
                                deploymentCompanyFilter={deploymentCompanyFilter}
                                quickUpdateWorkerDeployment={quickUpdateWorkerDeployment}
                                setDeploymentCompanyFilter={setDeploymentCompanyFilter}
                            />
                        )}
                    </div>
                </main>

                {modalType === 'add_worker' && (
                    <AddWorkerModal
                        addWorkerData={addWorkerData}
                        contractors={contractors}
                        onClose={() => setModalType(null)}
                        onSubmit={submitNewWorker}
                        setAddWorkerData={setAddWorkerData}
                        visibleContractors={visibleContractors}
                    />
                )}

                {activeVendor && modalType === 'company_profile' && (
                    <CompanyProfileModal
                        activeVendor={activeVendor}
                        canEdit={canEdit}
                        editingVendor={editingVendor}
                        getComplianceStatus={getComplianceStatus}
                        globalIncidents={globalIncidents}
                        globalPermits={globalPermits}
                        isGlobalUser={isGlobalUser}
                        navigate={navigate}
                        newDocReq={newDocReq}
                        onClose={() => {
                            setActiveVendor(null);
                            setModalType(null);
                            setEditingVendor(null);
                        }}
                        onHandleDocUpload={handleDocUpload}
                        onProvisionVendorPortalAccess={provisionVendorPortalAccess}
                        onRemoveWorker={removeWorkerFromProfile}
                        onRequestAdditionalDoc={requestAdditionalDoc}
                        onSaveCompanyEdit={saveCompanyProfileEdit}
                        portalProvisioning={portalProvisioning}
                        serviceTypes={SERVICE_TYPES}
                        setEditingVendor={setEditingVendor}
                        setNewDocReq={setNewDocReq}
                        visibleSites={visibleSites}
                    />
                )}

                {portalSuccess && <PortalSuccessModal onClose={() => setPortalSuccess(null)} portalSuccess={portalSuccess} />}

                {activeWorker && modalType === 'worker_profile' && (
                    <WorkerProfileModal
                        activeWorker={activeWorker}
                        canEdit={canEdit}
                        contractors={contractors}
                        getComplianceStatus={getComplianceStatus}
                        navigate={navigate}
                        newWorkerDocReq={newWorkerDocReq}
                        onClose={() => {
                            setActiveWorker(null);
                            setModalType(null);
                        }}
                        onHandleWorkerCoreDocUpload={handleWorkerCoreDocUpload}
                        onRequestAdditionalWorkerDoc={requestAdditionalWorkerDoc}
                        onUploadAdditionalWorkerDoc={uploadAdditionalWorkerDoc}
                        setNewWorkerDocReq={setNewWorkerDocReq}
                    />
                )}
            </div>
        </>
    );
}
