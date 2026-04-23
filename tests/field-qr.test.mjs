import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFieldQrNavigation } from '../src/pages/FieldApp/utils.js';

test('field QR resolver routes PTW QR codes with org and site preserved', () => {
    const result = resolveFieldQrNavigation({
        decodedText: 'https://field.example.com/ptw?ptw=permit-key-1&site=SITE-01&org=org-1&fieldQr=1'
    });

    assert.equal(result.moduleId, 'ptw');
    assert.equal(result.site, 'SITE-01');
    assert.equal(result.path, '/ptw?ptw=permit-key-1&site=SITE-01&fieldQr=1&org=org-1');
});

test('field QR resolver routes LOTO and emergency equipment tags to actionable pages', () => {
    const loto = resolveFieldQrNavigation({
        decodedText: '/loto?execute=loto-key-1&org=org-1&site=GLOBAL',
        fallbackSite: 'SITE-02'
    });
    const equipment = resolveFieldQrNavigation({
        decodedText: '/emergency-equipment?scan=eq-key-1&org=org-1',
        fallbackSite: 'SITE-03'
    });

    assert.equal(loto.path, '/loto?execute=loto-key-1&site=All&fieldQr=1&org=org-1');
    assert.equal(equipment.path, '/emergency-equipment?scan=eq-key-1&site=SITE-03&fieldQr=1&org=org-1');
});

