import { test, expect } from '@playwright/test';

const EMAIL = `sitetest_1775150242186@pillartest.io`;
const PASSWORD = 'TestPass123!';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3000';

test.describe('Pillar E2E Flows', () => {
  test.beforeAll(async ({ request }) => {
    // 1. Register
    const regRes = await request.post(`${API_URL}/api/auth/register`, {
      data: { email: EMAIL, password: PASSWORD }
    });
    console.log(`Register status: ${regRes.status()}`);

    // 2. Login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD }
    });
    console.log(`Login status: ${loginRes.status()}`);

    // 3. Onboarding
    const orgRes = await request.post(`${API_URL}/api/organizations`, {
      data: {
        name: "Oakdale Lions Club",
        type: "Lions Club",
        mission: "Service to our community",
        services: ["Youth programs", "Food pantry"],
        tagline: "We Serve"
      }
    });
    console.log(`Onboarding status: ${orgRes.status()}`);
  });

  test('Flow 1: Site Builder — Generate Site', async ({ page }) => {
    // Login via UI to ensure session is set in browser
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Navigate to Site Builder
    await page.goto(`${BASE_URL}/dashboard/site-builder`);
    await expect(page.getByText(/Generate Website|Create Site|Let's build/i)).toBeVisible();

    // Click "Generate Website" or handle the interview if needed
    // Based on the code, if no site exists, it might be in interview mode.
    // The task says: Check for "Generate Website" or "Create Site" button
    const genBtn = page.getByRole('button', { name: /Generate Website|Create Site|Generate My Site/i });
    
    if (await genBtn.isVisible()) {
        await genBtn.click();
    } else {
        // Might need to complete interview or click a "Start" button
        const startBtn = page.getByRole('button', { name: /Let's build my website/i });
        if (await startBtn.isVisible()) {
            await startBtn.click();
            // Wait for AI to ask questions or for "Generate My Site" to appear
            await page.waitForTimeout(2000);
            const finalGenBtn = page.getByRole('button', { name: /Generate My Site/i });
            await expect(finalGenBtn).toBeVisible({ timeout: 10000 });
            await finalGenBtn.click();
        }
    }

    // Verify loading state
    await expect(page.getByText(/Generating|Building|Loading/i)).toBeVisible();

    // Wait up to 60 seconds for site generation to complete
    await expect(page.locator('iframe')).toBeVisible({ timeout: 60000 });

    // Verify NO JavaScript code visible as plain text
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('document.addEventListener');
    expect(bodyText).not.toContain('<script');

    // Check preview iframe content
    const iframe = page.frameLocator('iframe');
    await expect(iframe.locator('nav')).toBeVisible();
    await expect(iframe.locator('section.hero')).toBeVisible();
    
    // Check for raw JS in iframe
    const iframeBody = await iframe.locator('body').innerText();
    expect(iframeBody).not.toContain('document.addEventListener');
    expect(iframeBody).not.toContain('<script');
  });

  test('Flow 2: Events — Create Event', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Navigate to Events
    await page.goto(`${BASE_URL}/dashboard/events`);
    await expect(page.getByText(/Events/i)).toBeVisible();

    // Click "Add Event" or "New Event"
    await page.click('button:has-text("New Event")');

    // Fill in form
    await page.fill('input[placeholder="Summer Festival 2026"]', "Summer BBQ 1775150242186");
    
    // Date = next month
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateStr = nextMonth.toISOString().split('T')[0];
    await page.fill('input[type="date"]', dateStr);

    await page.fill('input[placeholder="City Hall Park"]', "City Park");
    await page.fill('textarea[placeholder="What\'s this event about?"]', "Annual summer gathering");

    // Submit
    await page.click('button:has-text("Create Event")');

    // Verify event appears
    await expect(page.getByText("Summer BBQ 1775150242186")).toBeVisible();
  });

  test('Flow 3: Content Studio', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Navigate to Content Studio
    await page.goto(`${BASE_URL}/dashboard/content-studio`);
    await expect(page.getByText(/Content Studio/i)).toBeVisible();

    // Select a content type
    await page.click('text=Press Release'); // Choosing one from the TASKS list seen in code

    // Enter a topic
    await page.fill('input[placeholder="e.g., Local Chamber Announces Annual Awards Gala"]', "New Community Garden Opening");
    await page.fill('textarea[placeholder="Date, location, what happened or is happening, why it matters..."]', "Opening next Saturday at 10 AM in the North End.");

    // Click Generate
    await page.click('button:has-text("Generate")');

    // Verify AI generates content within 30 seconds
    await expect(page.locator('pre')).not.toBeEmpty({ timeout: 30000 });
    await expect(page.getByText(/Copy/i)).toBeVisible();
  });
});
