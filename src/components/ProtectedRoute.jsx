import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { readStoredSession } from '../utils/session.js';
import { canAccessModule } from '../utils/permissions.js';
import useStore from '../store/useStore.js';

/**
 * Reads the stored session on every navigation. Valid session → render and
 * keep the live store in sync; otherwise redirect to /login. When `moduleId`
 * is given, the session must also have access to that module.
 */
export default function ProtectedRoute({ moduleId, children }) {
  const location = useLocation();
  const session = readStoredSession();
  const initializeSession = useStore((s) => s.initializeSession);

  useEffect(() => {
    if (session) initializeSession(session);
  }, [session, initializeSession]);

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (moduleId && !canAccessModule(session, moduleId)) {
    return <Navigate to="/app" replace />;
  }
  return children;
}
