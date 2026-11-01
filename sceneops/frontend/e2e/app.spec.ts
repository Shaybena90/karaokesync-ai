import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const NAV: [string, RegExp][] = [
  ["מרכז שליטה", /מרכז שליטה/],
  ["תיקים ומוצגים", /תיקים ומוצגים/],
  ["מצלמות (DVR/NVR)", /מצלמות/],
  ["מעבדת מדיה", /מעבדת מדיה/],
  ["אוטומציות ומשימות", /אוטומציות ומשימות/],
  ["דוחות ותיעוד", /דוחות ותיעוד/],
  ["שליטה מרחוק", /שליטה מרחוק/],
  ["התראות", /התראות/],
  ["הגדרות מערכת", /הגדרות מערכת/],
];

test("RTL root and every navigation item opens a working page", async ({ page }) => {
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  for (const [label, heading] of NAV) {
    await nav.getByRole("link", { name: new RegExp(label.replace(/[()]/g, "\\$&")) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  expect(errors).toEqual([]);
});

test("dashboard shows DB-backed KPIs and quick actions", async ({ page }) => {
  await login(page);
  for (const t of ["תיקים פתוחים", "מצלמות רשומות", "משימות בתהליך", "משימות שהושלמו"]) await expect(page.getByText(t).first()).toBeVisible();
  for (const t of ["פתח תיק חדש", "סריקת מדיה", "התחל טיפול מלא", "בדיקת מצלמה", "ייצוא הקלטות", "הפקת דוח"]) {
    await expect(page.getByRole("button", { name: new RegExp(t) })).toBeEnabled();
  }
  const api = await page.request.get("/api/health");
  expect(api.ok()).toBeTruthy();
});

test("full flow: case → exhibit → authorized source → full processing → draft report", async ({ page }) => {
  await login(page, "noa", "Invest!2025");
  const ref = `E2E-${Date.now().toString().slice(-6)}`;
  await page.getByRole("button", { name: "פתח תיק חדש" }).click();
  await page.getByLabel(/מספר תיק/).fill(ref);
  await page.getByLabel(/^כותרת/).fill("תיק בדיקה אוטומטית (בדוי)");
  await page.getByRole("button", { name: "פתיחת התיק" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(ref);

  await page.getByRole("button", { name: "הוספת מוצג" }).click();
  await page.getByLabel(/מזהה מוצג/).fill("001");
  await page.getByLabel(/תיאור קצר/).fill("ייצוא DVR לבדיקה");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText(/מוצג\s*001/).first()).toBeVisible();

  await page.getByRole("link", { name: "הוספת מקור" }).click();
  await expect(page.getByText("בחירת מקור ראיות מורשה")).toBeVisible();
  await page.getByRole("button", { name: /sample_data/ }).first().click();
  await page.getByRole("button", { name: /DVR-03_export/ }).click();
  await page.getByLabel(/אסמכתת הרשאה/).fill("צו בדיקה 1234 (בדוי)");
  await page.getByLabel(/אני מאשר\/ת שקיימת הרשאה/).check();
  await page.getByRole("button", { name: "אישור ורישום המקור" }).click();
  await expect(page.getByText("המקור נרשם בהצלחה")).toBeVisible();
  await page.getByRole("button", { name: /טיפול מלא/ }).click();

  await expect(page).toHaveURL(/automation\?job=\d+/);
  await expect(page.getByText("משימה #").first()).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').getByText("הושלם").first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "פתיחת הדוח שהופק" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("דוח עיבוד מדיה");
  await expect(page.getByText("טיוטה").first()).toBeVisible();
  const pdfHref = await page.getByRole("link", { name: "PDF" }).first().getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("viewer role is read-only", async ({ page }) => {
  await login(page, "viewer", "Viewer!2025");
  await expect(page.getByRole("button", { name: /פתח תיק חדש/ })).toBeDisabled();
  await page.goto("/cases");
  await expect(page.getByRole("button", { name: "פתח תיק חדש" })).toHaveCount(0);
});
