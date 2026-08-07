// RBAC core. Pure functions only — imported by both the app and Node unit tests.

export const ROLES = {
  GLOBAL_OWNER: 'Global Owner',
  SITE_OWNER: 'Site Owner',
  USER: 'User',
};

export const ALL_SITES = 'All Sites';

// Every routable module in the portal. `users` and `sites` are management
// modules granted only to owner roles.
export const MODULE_IDS = [
  'dashboard',
  'incidents',
  'riskAssessments',
  'ptwRecords',
  'lotoProcedures',
  'auditPlans',
  'capaActions',
  'trainings',
  'contractors',
  'inspectionRecords',
  'mockDrills',
  'emergencyEquipment',
  'improvements',
  'consultations',
  'healthCases',
  'users',
  'sites',
];

export const MANAGEMENT_MODULE_IDS = ['users', 'sites'];

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'global owner' || value === 'owner' || value === 'admin') return ROLES.GLOBAL_OWNER;
  if (value === 'site owner' || value === 'site admin') return ROLES.SITE_OWNER;
  return ROLES.USER;
}

/**
 * Authoritative session normalizer. Expands role-granted modules and
 * normalizes site access. Call it whenever building or validating a session.
 */
export function normalizeSessionPermissions(raw = {}) {
  const role = normalizeRole(raw.role);
  const assignedSite =
    role === ROLES.GLOBAL_OWNER ? ALL_SITES : String(raw.assignedSite || '').trim() || ALL_SITES;

  let accessibleModules;
  if (role === ROLES.GLOBAL_OWNER) {
    accessibleModules = [...MODULE_IDS];
  } else if (role === ROLES.SITE_OWNER) {
    // Site owners get every module (including user management for their site)
    // except the global Sites registry.
    accessibleModules = MODULE_IDS.filter((id) => id !== 'sites');
  } else {
    const requested = Array.isArray(raw.accessibleModules) ? raw.accessibleModules : [];
    accessibleModules = [
      'dashboard',
      ...requested.filter(
        (id) => MODULE_IDS.includes(id) && id !== 'dashboard' && !MANAGEMENT_MODULE_IDS.includes(id),
      ),
    ];
  }

  return {
    uid: raw.uid || null,
    orgId: raw.orgId || null,
    name: raw.name || raw.displayName || '',
    email: raw.email || '',
    role,
    assignedSite,
    accessibleModules,
    status: raw.status || 'Active',
  };
}

export function isSessionActive(session) {
  return Boolean(session?.uid && session?.orgId && session?.status === 'Active');
}

export function canAccessModule(session, moduleId) {
  return isSessionActive(session) && session.accessibleModules.includes(moduleId);
}

export function canManageUsers(session) {
  return canAccessModule(session, 'users');
}

export function hasAllSitesAccess(session) {
  return session?.assignedSite === ALL_SITES;
}

/** Filter records down to the session's site unless it has All Sites access. */
export function scopeRecordsToSite(session, records, siteField = 'site') {
  if (!Array.isArray(records)) return [];
  if (hasAllSitesAccess(session)) return records;
  return records.filter((r) => !r[siteField] || r[siteField] === session.assignedSite);
}
