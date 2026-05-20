"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockFirebaseAuthService = void 0;
const common_1 = require("@nestjs/common");
let MockFirebaseAuthService = class MockFirebaseAuthService {
    resolveAuthContext(headers = {}) {
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
    buildHeaderContext(headers) {
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
    readHeader(headers, key) {
        const value = headers[key];
        return Array.isArray(value) ? (value[0] || '').trim() : String(value || '').trim();
    }
};
exports.MockFirebaseAuthService = MockFirebaseAuthService;
exports.MockFirebaseAuthService = MockFirebaseAuthService = __decorate([
    (0, common_1.Injectable)()
], MockFirebaseAuthService);
