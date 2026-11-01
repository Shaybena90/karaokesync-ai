import { expect, type Page } from "@playwright/test";

export async function login(page: Page, user = "admin", pass = "Admin!2025") {
  await page.goto("/");
  await page.getByLabel(/שם משתמש/).fill(user);
  await page.getByLabel(/סיסמה/).fill(pass);
  await page.getByRole("button", { name: "כניסה למערכת" }).click();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();
}
