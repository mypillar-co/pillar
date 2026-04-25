import { test } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("DEBUG — dashboard site console errors", async ({ page }) => {
  page.on("console", msg => console.log("CONSOLE:", msg.type(), msg.text()));
  page.on("pageerror", err => console.log("PAGEERROR:", err.message));

  await loginToSteward(page, { targetPath: "/dashboard/site" });
  await page.waitForTimeout(5000);

  console.log("URL:", page.url());
  console.log("BODY TEXT:", (await page.locator("body").innerText()).slice(0, 1000));
  console.log("BUTTON COUNT:", await page.locator("button").count());
});