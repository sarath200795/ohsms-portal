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

// --- Import OHS Specialized Tools ---
import OhsTools from './pages/OhsTools';
import PTW from './pages/ptw';
import LOTO from './pages/LOTO';
import Health from './pages/Health';
import MockDrill from './pages/MockDrill';
import EmergencyEquipment from './pages/EmergencyEquipment';
import Inspections from './pages/Inspections';


// --- Global Security Interceptor ---
// Prevents unauthorized users from typing URLs directly into the browser
const ProtectedRoute = ({ children }) => {
    const session = sessionStorage.getItem('isoSession');

    if (!session) {
        // Save the intended destination if it's a deep link (like a QR code scan for LOTO or PTW)
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

    // Global Auth Listener to maintain session state with Firebase
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                sessionStorage.removeItem('isoSession');
            }
            setIsAuthChecking(false);
        });

        return () => unsubscribe();
    }, []);

    // Secure Loading Screen
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
                {/* Public Route */}
                <Route path="/" element={<Login />} />

                {/* Protected Admin & Dashboard Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/Analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
                <Route path="/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />

                {/* Protected Enterprise Management Modules */}
                <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
                <Route path="/risk" element={<ProtectedRoute><Risk /></ProtectedRoute>} />
                <Route path="/consultation" element={<ProtectedRoute><Consultation /></ProtectedRoute>} />
                <Route path="/audit" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
                <Route path="/Standards" element={<ProtectedRoute><Standards /></ProtectedRoute>} />
                <Route path="/capa" element={<ProtectedRoute><Capa /></ProtectedRoute>} />
                <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
                <Route path="/improvement" element={<ProtectedRoute><Improvement /></ProtectedRoute>} />

                {/* Protected OHS Tools & Field Execution */}
                <Route path="/ohs-tools" element={<ProtectedRoute><OhsTools /></ProtectedRoute>} />
                <Route path="/ptw" element={<ProtectedRoute><PTW /></ProtectedRoute>} />
                <Route path="/loto" element={<ProtectedRoute><LOTO /></ProtectedRoute>} />
                <Route path="/health-dashboard" element={<ProtectedRoute><Health /></ProtectedRoute>} />
                <Route path="/mock-drill" element={<ProtectedRoute><MockDrill /></ProtectedRoute>} />
                <Route path="/emergency-equipment" element={<EmergencyEquipment />} />
                <Route path="/inspections" element={<Inspections />} />


                {/* Fallback Route: Catch broken URLs and safely redirect to Login/Dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}
