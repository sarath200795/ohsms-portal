import { test, expect } from '@playwright/test';

test.describe('Application routing', () => {
    test('unknown route shows 404 page', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await expect(page.getByText('Error 404')).toBeVisible();
        await expect(page.getByText(/This page wandered off-site/i)).toBeVisible();
    });

    test('404 page shows Go to Sign In button when unauthenticated', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await expect(page.getByRole('button', { name: /go to sign in/i })).toBeVisible();
    });

    test('404 page Go to Sign In navigates to login', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await page.getByRole('button', { name: /go to sign in/i }).click();
        await expect(page).toHaveURL('/');
    });

    test('protected route /dashboard redirects unauthenticated user to login', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL('/');
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });

    test('protected route /incidents redirects unauthenticated user to login', async ({ page }) => {
        await page.goto('/incidents');
        await expect(page).toHaveURL('/');
    });

    test('protected route /health-dashboard redirects unauthenticated user to login', async ({ page }) => {
        await page.goto('/health-dashboard');
        await expect(page).toHaveURL('/');
    });

    test('protected route /users redirects unauthenticated user to login', async ({ page }) => {
        await page.goto('/users');
        await expect(page).toHaveURL('/');
    });

    test('root path renders login page', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL('/');
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });
});
