import { expect, test } from "@playwright/test";

/**
 * The quickest proof that a build works at all: each area renders, from the
 * seeded timetable, at the tests' fixed clock (Wednesday 10 March 2027,
 * 10:00 in London) while the browser sits in another timezone.
 */

test("the home page shows today's prayer times and the next prayer", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Prayer times" })).toBeVisible();

  const next = page.getByRole("region", { name: "Next prayer" });
  await expect(next).toContainText("Wednesday 10 March 2027");
  await expect(next).toContainText("Dhuhr begins");
  await expect(next.getByRole("timer")).toContainText(/Time until Dhuhr begins: 2 hr \d+ min/);

  const today = page.getByRole("table", { name: "Prayer times for Wednesday 10 March 2027" });
  await expect(today.getByRole("row", { name: /^Fajr/ })).toContainText("4:52 AM");
  await expect(today.getByRole("row", { name: /^Fajr/ })).toContainText("5:30 AM");
  await expect(today.getByRole("row", { name: /^Dhuhr/ })).toContainText("Next");
  await expect(today.getByRole("row", { name: /^Isha/ })).toContainText("7:30 PM");
});

test("the timetable page shows the current month", async ({ page }) => {
  await page.goto("/timetable");

  await expect(page).toHaveTitle(/Prayer timetable for March 2027/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("March 2027");
  await expect(page.getByRole("combobox", { name: "Month" })).toHaveValue("2027-03");
  await expect(page.getByRole("link", { name: /Previous month: February 2027/ })).toHaveAttribute(
    "href",
    "/timetable?month=2027-02",
  );
});

test("the TV display shows the mosque's clock, not the browser's", async ({ page }) => {
  await page.goto("/tv");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  // 10:00 in London is 15:00 in the browser's zone (Asia/Karachi).
  await expect(main.locator("time").first()).toContainText(/10:0\d/);
  await expect(page.getByRole("region", { name: "Next prayer time" })).toContainText("Dhuhr begins in");
  await expect(page.getByRole("table", { name: "Prayer times for today" }).getByRole("row")).toHaveCount(7);
});

test("the admin area asks for the password", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to the admin area" })).toBeVisible();
  await expect(page.getByLabel("Admin password")).toBeVisible();
});

test("the JSON feed serves the timetable for the mosque's today", async ({ request }) => {
  const response = await request.get("/api/display");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.settings.timezone).toBe("Europe/London");
  const today = payload.days.find((day: { date: string }) => day.date === "2027-03-10");
  expect(today).toMatchObject({ fajrBegins: "04:52", fajrJamaat: "05:30", ishaJamaat: "19:30" });
});
