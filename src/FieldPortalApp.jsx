import React, { Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AppExperienceShell from './components/AppExperienceShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import AppRouteFallback from './components/AppRouteFallback';
import { FIELD_PORTAL_SESSION_KEY } from './pages/FieldApp/portalAuth';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { canAuthenticateStatus, clearStoredSession, readStoredSession, writeStoredSession } from './utils/session';

const PTW = lazyWithRetry(() => import('./pages/PTW'), 'field-ptw');
const LOTO = lazyWithRetry(() => import('./pages/LOTO'), 'field-loto');
const Incidents = lazyWithRetry(() => import('./pages/Incidents'), 'field-incidents');
const MockDrill = lazyWithRetry(() => import('./pages/MockDrill'), 'field-mock-drill');
const EmergencyEquipment = lazyWithRetry(() => import('./pages/EmergencyEquipment'), 'field-emergency-equipment');
const Inspections = lazyWithRetry(() => import('./pages/Inspections'), 'field-inspections');
const FieldPortal = lazyWithRetry(() => import('./pages/FieldPortal'), 'field-portal-home');
const Tutorials = lazyWithRetry(() => import('./pages/Tutorials'), 'field-tutorials');

const FieldProtectedRoute = ({ children }) => {
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
        return <Navigate to="/" replace />;
    }

    return children;
};

export default function FieldPortalApp() {
    return (
        <Router>
            <AppErrorBoundary>
                <AppExperienceShell>
                    <Suspense
                        fallback={(
                            <AppRouteFallback
                                title="Loading Field Workspace"
                                subtitle="Preparing the requested field module with enterprise-safe chunk loading."
                            />
                        )}
                    >
                        <Routes>
                            <Route path="/" element={<FieldPortal />} />
                            <Route path="/field-portal" element={<FieldPortal />} />
                            <Route path="/field-app" element={<FieldPortal />} />
                            <Route path="/dashboard" element={<FieldPortal />} />
                            <Route path="/ohs-tools" element={<FieldPortal />} />
                            <Route path="/tutorials" element={<FieldProtectedRoute><Tutorials /></FieldProtectedRoute>} />

                            <Route path="/loto" element={<LOTO />} />
                            <Route path="/ptw" element={<PTW />} />
                            <Route path="/emergency-equipment" element={<EmergencyEquipment />} />

                            <Route path="/incidents" element={<FieldProtectedRoute><Incidents /></FieldProtectedRoute>} />
                            <Route path="/mock-drill" element={<FieldProtectedRoute><MockDrill /></FieldProtectedRoute>} />
                            <Route path="/inspections" element={<FieldProtectedRoute><Inspections /></FieldProtectedRoute>} />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </AppExperienceShell>
            </AppErrorBoundary>
        </Router>
    );
}
