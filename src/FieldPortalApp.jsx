import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PTW from './pages/PTW';
import LOTO from './pages/LOTO';
import Incidents from './pages/Incidents';
import MockDrill from './pages/MockDrill';
import EmergencyEquipment from './pages/EmergencyEquipment';
import Inspections from './pages/Inspections';
import FieldPortal from './pages/FieldPortal';
import Tutorials from './pages/Tutorials';
import { FIELD_PORTAL_SESSION_KEY } from './pages/FieldApp/portalAuth';
import AppExperienceShell from './components/AppExperienceShell';

const FieldProtectedRoute = ({ children }) => {
    let session = sessionStorage.getItem('isoSession');
    const fieldPortalSession = sessionStorage.getItem(FIELD_PORTAL_SESSION_KEY);

    if (!session && fieldPortalSession) {
        sessionStorage.setItem('isoSession', fieldPortalSession);
        session = fieldPortalSession;
    }

    if (!session) {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default function FieldPortalApp() {
    return (
        <Router>
            <AppExperienceShell>
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
            </AppExperienceShell>
        </Router>
    );
}
