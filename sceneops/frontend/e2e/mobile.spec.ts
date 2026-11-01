import { expect, test } from "@playwright/test";

test("mobile layout: drawer navigation and no horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/שם משתמש/).fill("admin");
  await page.getByLabel(/סיסמה/).fill("Admin!2025");
  await page.getByRole("button", { name: "כניסה למערכת" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/מרכז שליטה/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "פתיחת תפריט" }).click();
  await page.getByRole("dialog", { name: "תפריט ניווט" }).getByRole("link", { name: /מעבדת מדיה/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/מעבדת מדיה/);
});
