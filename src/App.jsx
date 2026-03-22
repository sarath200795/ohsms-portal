// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';

// --- Import Core Pages ---
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
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
import PTW from './pages/ptw'; // Note: Ensure this matches your file case exactly
import LOTO from './pages/LOTO';
import Health from './pages/Health';
import MockDrill from './pages/MockDrill';
import EmergencyEquipment from './pages/EmergencyEquipment';
import Inspections from './pages/Inspections';

// --- Import External Portals ---
import VendorPortal from './pages/VendorPortal';

// --- Global Security Interceptor ---
const ProtectedRoute = ({ children }) => {
    const session = sessionStorage.getItem('isoSession');

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
            if (!user) sessionStorage.removeItem('isoSession');
            setIsAuthChecking(false);
        });
        return () => unsubscribe();
    }, []);

    if (isAuthChecking) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
                <i className="fas fa-circle-notch fa-spin text-3xl mr-4 text-blue-500"></i>
                <h2 className="text-xl font-bold tracking-widest uppercase">Verifying Secure Session...</h2>
            </div>
        );
    }

    return (
        <Router>
            <Routes>
                {/* PUBLIC ROUTES */}
                <Route path="/" element={<Login />} />
                <Route path="/vendor-portal" element={<VendorPortal />} />

                {/* HYBRID ROUTES (Handles their own auth checks for QR codes) */}
                <Route path="/loto" element={<LOTO />} />
                <Route path="/ptw" element={<PTW />} />

                {/* PROTECTED ROUTES */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
                <Route path="/emergency-equipment" element={<ProtectedRoute><EmergencyEquipment /></ProtectedRoute>} />
                <Route path="/inspections" element={<ProtectedRoute><Inspections /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}