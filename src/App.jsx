// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import AppExperienceShell from './components/AppExperienceShell';

// --- Import Core Pages ---
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ActivityCalendar from './pages/ActivityCalendar';
import Tutorials from './pages/Tutorials';
import Users from './pages/Users';
import Sites from './pages/Sites';
import Analytics from "./pages/Analytics";

// --- Import Enterprise Modules ---
import Incidents from './pages/Incidents';
import Risk from './pages/Risk';
import Consultation from './pages/Consultation';
import Audit from './pages/Audit';
import Standards from './pages/Standards';
import Capa from './pages/Capa';
import Training from './pages/Training';
import Improvement from './pages/Improvement';
import Contractors from './pages/Contractors';

// --- Import OHS Specialized Tools ---
import OhsTools from './pages/OhsTools';
import PTW from './pages/PTW';
import LOTO from './pages/LOTO';
import Health from './pages/Health';
import MockDrill from './pages/MockDrill';
import EmergencyEquipment from './pages/EmergencyEquipment';
import Inspections from './pages/Inspections';
import FieldApp from './pages/FieldApp';
import FieldPortal from './pages/FieldPortal';
import { FIELD_PORTAL_SESSION_KEY } from './pages/FieldApp/portalAuth';

// --- Import External Portals ---
import VendorPortal from './pages/VendorPortal';

// --- Global Security Interceptor ---
const ProtectedRoute = ({ children }) => {
    let session = sessionStorage.getItem('isoSession');
    const fieldPortalSession = sessionStorage.getItem(FIELD_PORTAL_SESSION_KEY);

    if (!session && fieldPortalSession) {
        sessionStorage.setItem('isoSession', fieldPortalSession);
        session = fieldPortalSession;
    }

    if (!session) {
        const currentUrl = window.location.href;
        if (currentUrl.includes('?')) {
            sessionStorage.setItem('pendingRedirect', currentUrl);
        }
        return <Navigate to="/" replace />;
    }

    return children;
};

export default function App() {
    const [isAuthChecking, setIsAuthChecking] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user && !sessionStorage.getItem(FIELD_PORTAL_SESSION_KEY)) {
                sessionStorage.removeItem('isoSession');
            }
            setIsAuthChecking(false);
        });
        return () => unsubscribe();
    }, []);

    if (isAuthChecking) {
        return (
            <div className="myth-shell flex h-screen items-center justify-center bg-[#080705] text-white">
                <div className="command-panel rounded-[2rem] px-8 py-7">
                    <div className="flex items-center gap-4">
                        <i className="fas fa-circle-notch fa-spin text-3xl text-[var(--myth-cyan)]"></i>
                        <div>
                            <p className="legendary-title text-[11px] font-bold uppercase tracking-[0.35em] text-[var(--myth-cyan)]">Session Check</p>
                            <h2 className="mt-1 text-2xl font-black uppercase tracking-[0.22em] text-white">Validating Access</h2>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <Router>
            <AppExperienceShell>
                <Routes>
                    {/* PUBLIC ROUTES */}
                    <Route path="/" element={<Login />} />
                    <Route path="/vendor-portal" element={<VendorPortal />} />
                    <Route path="/field-portal" element={<FieldPortal />} />

                    {/* HYBRID ROUTES (Handles their own auth checks for QR codes) */}
                    <Route path="/loto" element={<LOTO />} />
                    <Route path="/ptw" element={<PTW />} />
                    <Route path="/emergency-equipment" element={<EmergencyEquipment />} />

                    {/* PROTECTED ROUTES */}
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/activity-calendar" element={<ProtectedRoute><ActivityCalendar /></ProtectedRoute>} />
                    <Route path="/tutorials" element={<ProtectedRoute><Tutorials /></ProtectedRoute>} />
                    <Route path="/Analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                    <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
                    <Route path="/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
                    <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
                    <Route path="/risk" element={<ProtectedRoute><Risk /></ProtectedRoute>} />
                    <Route path="/consultation" element={<ProtectedRoute><Consultation /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
                    <Route path="/Standards" element={<ProtectedRoute><Standards /></ProtectedRoute>} />
                    <Route path="/capa" element={<ProtectedRoute><Capa /></ProtectedRoute>} />
                    <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
                    <Route path="/improvement" element={<ProtectedRoute><Improvement /></ProtectedRoute>} />
                    <Route path="/contractors" element={<ProtectedRoute><Contractors /></ProtectedRoute>} />
                    <Route path="/ohs-tools" element={<ProtectedRoute><OhsTools /></ProtectedRoute>} />
                    <Route path="/health-dashboard" element={<ProtectedRoute><Health /></ProtectedRoute>} />
                    <Route path="/mock-drill" element={<ProtectedRoute><MockDrill /></ProtectedRoute>} />
                    <Route path="/inspections" element={<ProtectedRoute><Inspections /></ProtectedRoute>} />
                    <Route path="/field-app" element={<ProtectedRoute><FieldApp /></ProtectedRoute>} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AppExperienceShell>
        </Router>
    );
}
