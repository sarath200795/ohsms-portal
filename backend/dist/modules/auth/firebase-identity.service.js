"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseIdentityService = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const firebase_admin_1 = require("../../shared/firebase-admin");
const runtime_config_1 = require("../../shared/runtime-config");
let FirebaseIdentityService = class FirebaseIdentityService {
    extractBearerToken(headers = {}) {
        const authorizationHeader = headers.authorization;
        const headerValue = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
        const token = headerValue?.replace(/^Bearer\s+/i, '').trim();
        return token || '';
    }
    isFirebaseAuthConfigured() {
        return (0, firebase_admin_1.hasFirebaseAdminCredentials)();
    }
    isFirebaseDatabaseConfigured() {
        return (0, firebase_admin_1.canUseFirebaseDatabase)();
    }
    isDevBypassEnabled() {
        return (0, runtime_config_1.isDevAuthBypassEnabled)();
    }
    getHealthSnapshot() {
        return {
            firebaseAdminConfigured: this.isFirebaseAuthConfigured(),
            firebaseDatabaseConfigured: this.isFirebaseDatabaseConfigured(),
            firebaseDatabaseUrlConfigured: Boolean((0, firebase_admin_1.getFirebaseDatabaseUrl)()),
            devAuthBypassEnabled: this.isDevBypassEnabled()
        };
    }
    async resolveVerifiedAuthContext(headers = {}) {
        const bearerToken = this.extractBearerToken(headers);
        if (!bearerToken) {
            throw new common_1.UnauthorizedException('Missing bearer token.');
        }
        if (!this.isFirebaseAuthConfigured()) {
            throw new common_1.UnauthorizedException('Firebase Admin authentication is not configured on this backend.');
        }
        if (!this.isFirebaseDatabaseConfigured()) {
            throw new common_1.ForbiddenException('Firebase Realtime Database is required to resolve organization access context.');
        }
        const decoded = await (0, auth_1.getAuth)((0, firebase_admin_1.getOrInitializeFirebaseAdminApp)()).verifyIdToken(bearerToken);
        const database = (0, database_1.getDatabase)((0, firebase_admin_1.getOrInitializeFirebaseAdminApp)());
        const orgIdFromHeader = this.readHeader(headers, 'x-ohsms-org-id');
        const orgIdFromDirectory = await this.readOrgIdFromDirectory(database, decoded.uid);
        const orgId = String(decoded.orgId || orgIdFromDirectory || orgIdFromHeader || '').trim();
        if (!orgId) {
            throw new common_1.ForbiddenException('Organization context could not be resolved for this user.');
        }
        if (orgIdFromHeader && orgIdFromDirectory && orgIdFromHeader !== orgIdFromDirectory) {
            throw new common_1.ForbiddenException('The provided organization context does not match the user directory mapping.');
        }
        const orgUser = await this.readOrgUser(database, orgId, decoded.uid, decoded.email || '');
        if (!orgUser) {
            throw new common_1.ForbiddenException('No active organization user record was found for this Firebase identity.');
        }
        const status = String(orgUser.status || 'Active').trim().toLowerCase();
        if (status !== 'active') {
            throw new common_1.ForbiddenException(`This organization account is ${orgUser.status || 'Inactive'} and cannot use Incident AI.`);
        }
        return {
            uid: decoded.uid,
            email: decoded.email || String(orgUser.email || '').trim(),
            orgId,
            role: String(orgUser.role || decoded.role || 'User').trim() || 'User',
            siteIds: this.buildSiteIds(orgUser, decoded)
        };
    }
    async readOrgIdFromDirectory(database, uid) {
        const snapshot = await database.ref(`userDirectory/${uid}/orgId`).get();
        return snapshot.exists() ? String(snapshot.val() || '').trim() : '';
    }
    async readOrgUser(database, orgId, uid, email) {
        const directSnapshot = await database.ref(`organizations/${orgId}/users/${uid}`).get();
        if (directSnapshot.exists()) {
            return directSnapshot.val();
        }
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) {
            return null;
        }
        const emailSnapshot = await database
            .ref(`organizations/${orgId}/users`)
            .orderByChild('email')
            .equalTo(normalizedEmail)
            .limitToFirst(1)
            .get();
        if (!emailSnapshot.exists()) {
            return null;
        }
        const value = emailSnapshot.val();
        const firstMatch = Object.values(value)[0];
        return firstMatch || null;
    }
    buildSiteIds(orgUser, decoded) {
        const accessibleSites = this.normalizeSiteArray(orgUser.accessibleSites)
            .concat(this.normalizeSiteArray(decoded.siteIds))
            .concat(this.normalizeSiteArray(decoded.accessibleSites));
        const assignedSite = String(orgUser.assignedSite || decoded.assignedSite || '').trim();
        const combined = new Set();
        if (assignedSite)
            combined.add(assignedSite);
        accessibleSites.forEach((siteId) => combined.add(siteId));
        return [...combined].filter(Boolean);
    }
    normalizeSiteArray(value) {
        if (Array.isArray(value)) {
            return value.map((item) => String(item || '').trim()).filter(Boolean);
        }
        if (value && typeof value === 'object') {
            return Object.values(value).map((item) => String(item || '').trim()).filter(Boolean);
        }
        return [];
    }
    readHeader(headers, key) {
        const value = headers[key];
        return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
    }
};
exports.FirebaseIdentityService = FirebaseIdentityService;
exports.FirebaseIdentityService = FirebaseIdentityService = __decorate([
    (0, common_1.Injectable)()
], FirebaseIdentityService);
