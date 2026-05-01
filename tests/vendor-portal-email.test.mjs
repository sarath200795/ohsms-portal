import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVendorCredentialEmailCopy, buildVendorCredentialMailto } from '../src/utils/vendorPortalEmail.js';

test('vendor credential email copy includes first login instructions', () => {
    const copy = buildVendorCredentialEmailCopy({
        companyName: 'Acme Contractors',
        portalUrl: 'https://example.com/vendor-portal',
        temporaryPassword: 'VEN-Temp!123',
        toEmail: 'vendor@acme.com',
        toName: 'Jane Vendor',
        vendorCode: 'VEN-ACME01',
        siteName: 'Plant 1 (P1)'
    });

    assert.match(copy, /Portal Email: vendor@acme\.com/);
    assert.match(copy, /Temporary Password: VEN-Temp!123/);
    assert.match(copy, /change the password immediately/i);
    assert.match(copy, /sign in again with your new password/i);
});

test('vendor credential mailto encodes the onboarding email content', () => {
    const mailto = buildVendorCredentialMailto({
        toEmail: 'vendor@acme.com',
        companyName: 'Acme Contractors',
        portalUrl: 'https://example.com/vendor-portal',
        temporaryPassword: 'VEN-Temp!123',
        toName: 'Jane Vendor'
    });

    assert.match(mailto, /^mailto:vendor@acme\.com\?/);
    assert.match(mailto, /Temporary%20Password%20-%20Acme%20Contractors/);
    assert.match(mailto, /VEN-Temp!123/);
});
