import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ModulePage from './components/ModulePage.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Sites from './pages/Sites.jsx';
import NotFound from './pages/NotFound.jsx';
import { MODULES } from './modules/registry.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          {MODULES.map((m) => (
            <Route
              key={m.id}
              path={m.id}
              element={
                <ProtectedRoute moduleId={m.id}>
                  <ModulePage key={m.id} config={m} />
                </ProtectedRoute>
              }
            />
          ))}
          <Route
            path="users"
            element={
              <ProtectedRoute moduleId="users">
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="sites"
            element={
              <ProtectedRoute moduleId="sites">
                <Sites />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
