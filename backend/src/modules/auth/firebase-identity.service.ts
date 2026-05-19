import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import type { IncomingHttpHeaders } from 'node:http';
import type { AuthContext } from '../../shared/types/auth-context';
import { canUseFirebaseDatabase, getFirebaseDatabaseUrl, getOrInitializeFirebaseAdminApp, hasFirebaseAdminCredentials } from '../../shared/firebase-admin';
import { isDevAuthBypassEnabled } from '../../shared/runtime-config';

interface OrgUserRecord {
    name?: string;
    email?: string;
    role?: string;
    status?: string;
    assignedSite?: string;
    accessibleSites?: string[] | Record<string, string>;
}

@Injectable()
export class FirebaseIdentityService {
    extractBearerToken(headers: IncomingHttpHeaders = {}) {
        const authorizationHeader = headers.authorization;
        const headerValue = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
        const token = headerValue?.replace(/^Bearer\s+/i, '').trim();
        return token || '';
    }

    isFirebaseAuthConfigured() {
        return hasFirebaseAdminCredentials();
    }

    isFirebaseDatabaseConfigured() {
        return canUseFirebaseDatabase();
    }

    isDevBypassEnabled() {
        return isDevAuthBypassEnabled();
    }

    getHealthSnapshot() {
        return {
            firebaseAdminConfigured: this.isFirebaseAuthConfigured(),
            firebaseDatabaseConfigured: this.isFirebaseDatabaseConfigured(),
            firebaseDatabaseUrlConfigured: Boolean(getFirebaseDatabaseUrl()),
            devAuthBypassEnabled: this.isDevBypassEnabled()
        };
    }

    async resolveVerifiedAuthContext(headers: IncomingHttpHeaders = {}): Promise<AuthContext> {
        const bearerToken = this.extractBearerToken(headers);
        if (!bearerToken) {
            throw new UnauthorizedException('Missing bearer token.');
        }
        if (!this.isFirebaseAuthConfigured()) {
            throw new UnauthorizedException('Firebase Admin authentication is not configured on this backend.');
        }
        if (!this.isFirebaseDatabaseConfigured()) {
            throw new ForbiddenException('Firebase Realtime Database is required to resolve organization access context.');
        }

        const decoded = await getAuth(getOrInitializeFirebaseAdminApp()).verifyIdToken(bearerToken);
        const database = getDatabase(getOrInitializeFirebaseAdminApp());

        const orgIdFromHeader = this.readHeader(headers, 'x-ohsms-org-id');
        const orgIdFromDirectory = await this.readOrgIdFromDirectory(database, decoded.uid);
        const orgId = String(decoded.orgId || orgIdFromDirectory || orgIdFromHeader || '').trim();

        if (!orgId) {
            throw new ForbiddenException('Organization context could not be resolved for this user.');
        }
        if (orgIdFromHeader && orgIdFromDirectory && orgIdFromHeader !== orgIdFromDirectory) {
            throw new ForbiddenException('The provided organization context does not match the user directory mapping.');
        }

        const orgUser = await this.readOrgUser(database, orgId, decoded.uid, decoded.email || '');
        if (!orgUser) {
            throw new ForbiddenException('No active organization user record was found for this Firebase identity.');
        }

        const status = String(orgUser.status || 'Active').trim().toLowerCase();
        if (status !== 'active') {
            throw new ForbiddenException(`This organization account is ${orgUser.status || 'Inactive'} and cannot use Incident AI.`);
        }

        return {
            uid: decoded.uid,
            email: decoded.email || String(orgUser.email || '').trim(),
            orgId,
            role: String(orgUser.role || decoded.role || 'User').trim() || 'User',
            siteIds: this.buildSiteIds(orgUser, decoded)
        };
    }

    private async readOrgIdFromDirectory(database: ReturnType<typeof getDatabase>, uid: string) {
        const snapshot = await database.ref(`userDirectory/${uid}/orgId`).get();
        return snapshot.exists() ? String(snapshot.val() || '').trim() : '';
    }

    private async readOrgUser(
        database: ReturnType<typeof getDatabase>,
        orgId: string,
        uid: string,
        email: string
    ): Promise<OrgUserRecord | null> {
        const directSnapshot = await database.ref(`organizations/${orgId}/users/${uid}`).get();
        if (directSnapshot.exists()) {
            return directSnapshot.val() as OrgUserRecord;
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

        const value = emailSnapshot.val() as Record<string, OrgUserRecord>;
        const firstMatch = Object.values(value)[0];
        return firstMatch || null;
    }

    private buildSiteIds(orgUser: OrgUserRecord, decoded: Record<string, unknown>) {
        const accessibleSites = this.normalizeSiteArray(orgUser.accessibleSites)
            .concat(this.normalizeSiteArray(decoded.siteIds))
            .concat(this.normalizeSiteArray(decoded.accessibleSites));

        const assignedSite = String(orgUser.assignedSite || decoded.assignedSite || '').trim();
        const combined = new Set<string>();
        if (assignedSite) combined.add(assignedSite);
        accessibleSites.forEach((siteId) => combined.add(siteId));
        return [...combined].filter(Boolean);
    }

    private normalizeSiteArray(value: unknown) {
        if (Array.isArray(value)) {
            return value.map((item) => String(item || '').trim()).filter(Boolean);
        }

        if (value && typeof value === 'object') {
            return Object.values(value).map((item) => String(item || '').trim()).filter(Boolean);
        }

        return [];
    }

    private readHeader(headers: IncomingHttpHeaders, key: string) {
        const value = headers[key];
        return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
    }
}
