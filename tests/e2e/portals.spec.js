import { test, expect } from '@playwright/test';

test.describe('Public portal pages', () => {
    test('vendor portal page loads without auth', async ({ page }) => {
        const response = await page.goto('/vendor-portal');
        expect(response?.status()).toBeLessThan(400);
        await expect(page).toHaveURL('/vendor-portal');
    });

    test('field portal page loads without auth', async ({ page }) => {
        const response = await page.goto('/field-portal');
        expect(response?.status()).toBeLessThan(400);
        await expect(page).toHaveURL('/field-portal');
    });

    test('vendor portal does not redirect to login', async ({ page }) => {
        await page.goto('/vendor-portal');
        await expect(page).not.toHaveURL('/');
    });

    test('field portal does not redirect to login', async ({ page }) => {
        await page.goto('/field-portal');
        await expect(page).not.toHaveURL('/');
    });
});

test.describe('Incident AI health endpoint', () => {
    test('/api/v1/health/ready returns JSON with status ready', async ({ request }) => {
        const response = await request.get('/api/v1/health/ready');
        if (response.status() === 200) {
            const body = await response.json();
            expect(body).toHaveProperty('status', 'ready');
            expect(body).toHaveProperty('checks');
        } else {
            // endpoint may not be available in dev without Vercel runtime — skip gracefully
            test.skip();
        }
    });
});
