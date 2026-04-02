import { test, expect } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000'; // Assuming the app runs on 3000, let's double check if it's different.
// Wait, steward is usually on 5173 or 3000. Let's try to detect it or use a default.
// Actually, I'll use process.env.STREWARD_URL or default to 5173 which is common for Vite.
// Let's check package.json for steward.
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

test.describe('Pillar E2E Tests', () => {
  const timestamp = Date.now();
  const regEmail = `e2e_test_${timestamp}@pillartest.io`;
  const loginEmail = `login_test_${timestamp}@pillartest.io`;
  const password = 'TestPass123!';

  test('Flow 1: Registration', async ({ page }) => {
    console.log('Starting Flow 1: Registration');
    
    // 2. Navigate to /
    await page.goto(APP_URL);
    
    // 3. Verify landing page
    await expect(page.locator('h1')).toContainText('Your organization');
    await expect(page.locator('text=Pricing')).toBeVisible();
    await expect(page.locator('text=Everything your organization needs')).toBeVisible();

    // 4. Click "Get Started"
    const getStarted = page.getByRole('button', { name: /Start Your Free Trial/i }).or(page.getByRole('link', { name: /Get Started/i }));
    await getStarted.click();

    // 5. Navigate to /register
    if (page.url() !== `${APP_URL}/register`) {
      await page.goto(`${APP_URL}/register`);
    }

    // 6. Verify registration form
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // 7. Fill in details
    await page.locator('input[placeholder="Jane"]').fill('E2E');
    await page.locator('input[placeholder="Smith"]').fill('Tester');
    await page.locator('input[type="email"]').fill(regEmail);
    await page.locator('input[type="password"]').fill(password);

    // 8. Submit
    await page.getByRole('button', { name: /Create account/i }).click();

    // 9. Verify redirect
    await page.waitForURL(/\/onboard|\/dashboard/);
    expect(page.url()).toMatch(/\/onboard|\/dashboard/);
    
    console.log('Flow 1 Complete');
  });

  test('Flow 2, 3, 4: Login, Navigation, Onboarding', async ({ page, request }) => {
    console.log('Starting Flow 2: Login');

    // 4. Create fresh user via API
    // Note: We need to know where the API is. Usually same host or /api prefix.
    const registerResponse = await request.post(`${APP_URL}/api/auth/register`, {
      data: {
        email: loginEmail,
        password: password,
        firstName: 'Login',
        lastName: 'Tester',
        _gotcha: '',
        _ft: Date.now()
      }
    });
    expect(registerResponse.ok()).toBeTruthy();

    // 2. Navigate to /login
    await page.goto(`${APP_URL}/login`);

    // 3. Verify login form
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // 5. Enter credentials
    await page.locator('input[type="email"]').fill(loginEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /Sign in/i }).click();

    // 6. Verify redirect to dashboard/onboard
    await page.waitForURL(/\/dashboard|\/onboard/);
    
    // FLOW 4: Onboarding (if on /onboard)
    if (page.url().includes('/onboard')) {
      console.log('Starting Flow 4: Onboarding');
      await expect(page.locator('text=Tell us about your organization')).toBeVisible();
      
      await page.locator('input[name="name"]').fill('E2E Test Civic Club');
      await page.locator('select[name="type"]').selectOption('Civic Organization');
      await page.locator('input[name="category"]').fill('Testing the platform end to end.');
      await page.locator('input[type="checkbox"]').check();
      
      await page.getByRole('button', { name: /Continue/i }).click();
      
      // Step 2: Plan
      await page.waitForSelector('text=Choose how much autopilot you want');
      // Skip for now
      await page.getByRole('button', { name: /Skip for now/i }).click();
      
      // Step 3: Success
      await expect(page.locator('text=You\'re all set!')).toBeVisible();
      await page.getByRole('button', { name: /take me to the dashboard/i }).click();
      
      await page.waitForURL(/\/dashboard/);
      await expect(page.locator('text=E2E Test Civic Club')).toBeVisible();
    }

    // FLOW 3: Dashboard Navigation
    console.log('Starting Flow 3: Dashboard Navigation');
    const navItems = [
      { name: 'Overview', path: '/dashboard' },
      { name: 'Site Builder', path: '/dashboard/site' },
      { name: 'Events', path: '/dashboard/events' },
      { name: 'Content Studio', path: '/dashboard/studio' },
      { name: 'Payments', path: '/dashboard/payments' },
      { name: 'Social', path: '/dashboard/social' },
      { name: 'Contacts', path: '/dashboard/contacts' },
      { name: 'Help', path: '/dashboard/help' },
    ];

    for (const item of navItems) {
      console.log(`Navigating to ${item.name}`);
      // Try clicking in sidebar if visible, or direct navigation
      const sidebarLink = page.locator('aside').getByRole('link', { name: item.name, exact: true });
      if (await sidebarLink.isVisible()) {
        await sidebarLink.click();
      } else {
        await page.goto(`${APP_URL}${item.path}`);
      }
      
      // Verify no crash (white screen)
      const bodyText = await page.innerText('body');
      expect(bodyText.length).toBeGreaterThan(100);
      
      // Check for common error indicators
      await expect(page.locator('text=Something went wrong')).not.toBeVisible();
      await expect(page.locator('text=404')).not.toBeVisible();
    }
    
    console.log('Flow 2, 3, 4 Complete');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `test-results/screenshots/${testInfo.title.replace(/\s+/g, '_')}_failed.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to: ${screenshotPath}`);
    }
  });
});
