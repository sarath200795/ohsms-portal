import { Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { AuthContext } from '../../shared/types/auth-context';

@Injectable()
export class MockFirebaseAuthService {
    resolveAuthContext(headers: IncomingHttpHeaders = {}): AuthContext {
        const headerContext = this.buildHeaderContext(headers);
        return {
            uid: headerContext.uid || process.env.DEV_AUTH_UID || 'dev-global-owner',
            email: headerContext.email || process.env.DEV_AUTH_EMAIL || 'test1@email.com',
            orgId: headerContext.orgId || process.env.DEV_AUTH_ORG_ID || 'demo-org',
            role: headerContext.role || process.env.DEV_AUTH_ROLE || 'Global Owner',
            siteIds: headerContext.siteIds.length > 0
                ? headerContext.siteIds
                : (process.env.DEV_AUTH_SITES || 'GLOBAL').split(',').map((site) => site.trim()).filter(Boolean)
        };
    }

    private buildHeaderContext(headers: IncomingHttpHeaders) {
        return {
            uid: this.readHeader(headers, 'x-dev-auth-uid'),
            email: this.readHeader(headers, 'x-dev-auth-email'),
            orgId: this.readHeader(headers, 'x-dev-auth-org-id'),
            role: this.readHeader(headers, 'x-dev-auth-role'),
            siteIds: this.readHeader(headers, 'x-dev-auth-sites')
                .split(',')
                .map((site) => site.trim())
                .filter(Boolean)
        };
    }

    private readHeader(headers: IncomingHttpHeaders, key: string) {
        const value = headers[key];
        return Array.isArray(value) ? (value[0] || '').trim() : String(value || '').trim();
    }
}
