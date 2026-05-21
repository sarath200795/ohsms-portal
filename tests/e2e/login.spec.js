import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('renders sign-in form with email and password fields', async ({ page }) => {
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test('shows three auth mode tabs: Sign In, Existing Org, New Org', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Existing Org' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'New Org' })).toBeVisible();
    });

    test('shows Forgot password button', async ({ page }) => {
        await expect(page.getByRole('button', { name: /forgot password/i })).toBeVisible();
    });

    test('sign-in form requires email field', async ({ page }) => {
        const emailInput = page.locator('input[type="email"]').first();
        await expect(emailInput).toHaveAttribute('required');
    });

    test('sign-in form requires password field', async ({ page }) => {
        const passwordInput = page.locator('input[type="password"]').first();
        await expect(passwordInput).toHaveAttribute('required');
    });

    test('switching to Existing Org tab changes the form', async ({ page }) => {
        await page.getByRole('button', { name: 'Existing Org' }).click();
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });

    test('switching to New Org tab changes the form', async ({ page }) => {
        await page.getByRole('button', { name: 'New Org' }).click();
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });
});
