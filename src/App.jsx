import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import AppExperienceShell from './components/AppExperienceShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import AppRouteFallback from './components/AppRouteFallback';
import { FIELD_PORTAL_SESSION_KEY } from './pages/FieldApp/portalAuth';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { canAuthenticateStatus, clearStoredSession, readStoredSession, writeStoredSession } from './utils/session';

const Login = lazyWithRetry(() => import('./pages/Login'), 'login');
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'), 'dashboard');
const ActivityCalendar = lazyWithRetry(() => import('./pages/ActivityCalendar'), 'activity-calendar');
const Tutorials = lazyWithRetry(() => import('./pages/Tutorials'), 'tutorials');
const Users = lazyWithRetry(() => import('./pages/Users'), 'users');
const Sites = lazyWithRetry(() => import('./pages/Sites'), 'sites');
const Analytics = lazyWithRetry(() => import('./pages/Analytics'), 'analytics');

const Incidents = lazyWithRetry(() => import('./pages/Incidents'), 'incidents');
const Risk = lazyWithRetry(() => import('./pages/Risk'), 'risk');
const Consultation = lazyWithRetry(() => import('./pages/Consultation'), 'consultation');
const Audit = lazyWithRetry(() => import('./pages/Audit'), 'audit');
const Standards = lazyWithRetry(() => import('./pages/Standards'), 'standards');
const Capa = lazyWithRetry(() => import('./pages/Capa'), 'capa');
const Training = lazyWithRetry(() => import('./pages/Training'), 'training');
const Improvement = lazyWithRetry(() => import('./pages/Improvement'), 'improvement');
const Contractors = lazyWithRetry(() => import('./pages/Contractors'), 'contractors');

const OhsTools = lazyWithRetry(() => import('./pages/OhsTools'), 'ohs-tools');
const PTW = lazyWithRetry(() => import('./pages/PTW'), 'ptw');
const LOTO = lazyWithRetry(() => import('./pages/LOTO'), 'loto');
const Health = lazyWithRetry(() => import('./pages/Health'), 'health');
const MockDrill = lazyWithRetry(() => import('./pages/MockDrill'), 'mock-drill');
const EmergencyEquipment = lazyWithRetry(() => import('./pages/EmergencyEquipment'), 'emergency-equipment');
const Inspections = lazyWithRetry(() => import('./pages/Inspections'), 'inspections');
const FieldApp = lazyWithRetry(() => import('./pages/FieldApp'), 'field-app');
const FieldPortal = lazyWithRetry(() => import('./pages/FieldPortal'), 'field-portal');

const VendorPortal = lazyWithRetry(() => import('./pages/VendorPortal'), 'vendor-portal');

const ProtectedRoute = ({ children }) => {
    let session = readStoredSession();
    const fieldPortalSession = readStoredSession(FIELD_PORTAL_SESSION_KEY);

    if (!session && fieldPortalSession) {
        session = writeStoredSession(fieldPortalSession);
    }

    if (session && !canAuthenticateStatus(session.status)) {
        clearStoredSession();
        session = null;
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
                clearStoredSession();
            }
            setIsAuthChecking(false);
        });
        return () => unsubscribe();
    }, []);

    if (isAuthChecking) {
        return (
            <AppRouteFallback
                title="Validating Access"
                subtitle="Checking your authenticated enterprise session before opening the workspace."
            />
        );
    }

    return (
        <Router>
            <AppErrorBoundary>
                <AppExperienceShell>
                    <Suspense
                        fallback={(
                            <AppRouteFallback
                                title="Loading Workspace"
                                subtitle="Streaming the next enterprise module and preparing its live data hooks."
                            />
                        )}
                    >
                        <Routes>
                            <Route path="/" element={<Login />} />
                            <Route path="/vendor-portal" element={<VendorPortal />} />
                            <Route path="/field-portal" element={<FieldPortal />} />

                            <Route path="/loto" element={<LOTO />} />
                            <Route path="/ptw" element={<PTW />} />
                            <Route path="/emergency-equipment" element={<EmergencyEquipment />} />

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
                    </Suspense>
                </AppExperienceShell>
            </AppErrorBoundary>
        </Router>
    );
}
