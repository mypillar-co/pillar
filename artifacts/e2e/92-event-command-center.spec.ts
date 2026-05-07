import { test, expect } from "@playwright/test";
import { API, STEWARD, TEST_ORG_SLUG, loginToSteward } from "./helpers";

type EventRow = {
  id: string;
  name: string;
  slug: string;
};

type EventDetailRow = {
  sponsors?: Array<{ name?: string | null }>;
};

test("Event Command Center surfaces event operations and gates vendor review", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const eventsRes = await page.request.get(`${API}/api/events`);
  expect(eventsRes.ok()).toBe(true);
  const eventsJson = await eventsRes.json();
  const events: EventRow[] = Array.isArray(eventsJson) ? eventsJson : eventsJson.events ?? [];
  const event = events.find((e) => /spring gala/i.test(e.name)) ?? events[0];
  if (!event) {
    test.skip(true, "No event exists to exercise the event command center.");
    return;
  }

  const smokeName = `E2E Command Center Vendor ${Date.now()}`;
  const applyRes = await page.request.post(
    `${API}/sites/${TEST_ORG_SLUG}/api/public/events/${event.slug}/vendor-apply`,
    {
      data: {
        _hp: "",
        _ts: Date.now() - 5000,
        businessName: smokeName,
        contactName: "Event Command Center Test",
        email: `event-command-center-${Date.now()}@example.com`,
        phone: "724-555-0199",
        vendorType: "Non-food vendor",
        products: "Smoke-test crafts and table goods.",
        isFoodVendor: false,
        truckTrailerSize: "N/A",
      },
    },
  );
  expect(applyRes.ok(), await applyRes.text()).toBe(true);

  await page.goto(`${STEWARD}/dashboard/events/${event.id}`, { waitUntil: "domcontentloaded" });
  const detailRes = await page.request.get(`${API}/api/events/${event.id}`);
  expect(detailRes.ok()).toBe(true);
  const eventDetail = (await detailRes.json()) as EventDetailRow;

  await expect(page.getByText("Event Command Center")).toBeVisible();
  await expect(page.getByText("Pending vendors")).toBeVisible();
  await expect(page.getByText("Pending sponsors")).toBeVisible();
  await expect(page.getByText("Missing docs")).toBeVisible();

  await page.getByRole("button", { name: "Communication", exact: true }).click();
  await expect(page.getByText("Communication Quick Actions")).toBeVisible();

  await page.getByRole("button", { name: /^Vendors\b/ }).click();
  await expect(page.getByRole("heading", { name: "Vendor Applications" })).toBeVisible();
  await expect(page.getByText(smokeName)).toBeVisible();

  const vendorCard = page.locator(".rounded-xl", { hasText: smokeName }).filter({
    has: page.getByRole("button", { name: /reject/i }),
  }).first();
  await expect(vendorCard.getByText("Insurance missing").first()).toBeVisible();
  await vendorCard.getByRole("button", { name: /reject/i }).click();
  const dialog = page.getByRole("dialog", { name: /reject application/i });
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea").fill("Certification smoke cleanup.");

  const rejectResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/registrations/") &&
      response.url().includes("/reject") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: /^reject$/i }).click();
  expect((await rejectResponse).ok()).toBe(true);

  await expect
    .poll(async () => {
      const regsRes = await page.request.get(`${API}/api/registrations?eventId=${event.id}`);
      if (!regsRes.ok()) return false;
      const regs = await regsRes.json();
      const row = regs.find((reg: { name: string }) => reg.name === smokeName);
      return row?.status === "rejected";
    })
    .toBeTruthy();

  const publicPage = await page.request.get(`${API}/sites/${TEST_ORG_SLUG}/events/${event.slug}`);
  expect(publicPage.status()).toBeLessThan(500);
  expect(await publicPage.text()).not.toContain("Internal Server Error");

  await page.goto(`${API}/sites/${TEST_ORG_SLUG}/events/${event.slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(/Internal Server Error/i);
  const sponsorName = eventDetail.sponsors?.find((s) => s.name)?.name;
  if (sponsorName) {
    await expect(page.getByText(sponsorName, { exact: false }).first()).toBeVisible();
  }
});
