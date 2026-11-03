import { test, expect, type Page } from "@playwright/test";
import { comparisonFixture } from "./fixtures";

// Keep UI checks independent of external tile availability; the real Mapbox
// integration is exercised separately in the documented live smoke check.
test.beforeEach(async ({ page }) => {
  await page.route(
    "https://api.mapbox.com/styles/v1/mapbox/dark-v11**",
    (route) =>
      route.fulfill({
        json: {
          version: 8,
          glyphs:
            "https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf",
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#062434" },
            },
          ],
        },
      }),
  );
});

async function locations(page: Page) {
  await page.route("**/api/places?**", async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get("query") || "";
    const place = query.toLowerCase().includes("chicago")
      ? { label: "Chicago, IL", coordinate: [-87.6298, 41.8781] }
      : { label: "Dallas, TX", coordinate: [-96.797, 32.7767] };
    await route.fulfill({ json: { places: [place] } });
  });
}

async function fillTrip(page: Page) {
  for (const [label, query] of [
    ["Origin", "Dallas"],
    ["Destination", "Chicago"],
  ]) {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.fill(query);
    await expect(
      page.getByRole("option", { name: new RegExp(query) }),
    ).toBeVisible();
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue(
      query === "Dallas" ? "Dallas, TX" : "Chicago, IL",
    );
  }
}

test("compare, inspect, and explore forecasts without changing the recommendation or refetching", async ({
  page,
}) => {
  await locations(page);
  let comparisons = 0;
  await page.route("**/api/compare", async (route) => {
    comparisons++;
    expect(route.request().postDataJSON().load_lb).toBe(38000);
    await route.fulfill({ json: comparisonFixture() });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await fillTrip(page);
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 route options" }),
  ).toBeVisible();
  await expect(page.getByText("Recommended", { exact: true })).toHaveCount(1);
  const recommended = page.getByRole("button", {
    name: "Select route A: I-44",
    exact: true,
  });
  await expect(recommended).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Select route C: I-57" }).click();
  await expect(
    recommended.getByText("Recommended", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Inspect a checkpoint", { exact: true })
    .selectOption("2");
  const details = page.getByRole("region", { name: "Checkpoint details" });
  await expect(details).toContainText("No Travel risk");
  await expect(details).toContainText("load above 30,000 lb");
  await page.getByRole("button", { name: "Close checkpoint details" }).click();
  const slider = page.getByRole("slider", {
    name: "Forecast hours after departure",
  });
  await slider.fill("24");
  await expect(page.locator("output")).toHaveText("+24 hours");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page.locator("output")).toHaveText("+25 hours");
  const toggle = page.getByRole("switch", { name: "Weather layer" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(comparisons).toBe(1);
  await expect(
    recommended.getByText("Recommended", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toHaveCount(1);
});

test("shows loading, recovers from a provider failure, and marks edited results as stale", async ({
  page,
}) => {
  await locations(page);
  let attempts = 0;
  await page.route("**/api/compare", async (route) => {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (attempts === 1)
      await route.fulfill({
        status: 504,
        json: {
          error: { message: "The data provider timed out. Please try again." },
        },
      });
    else await route.fulfill({ json: comparisonFixture() });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await fillTrip(page);
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Comparing routes…" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("timed out");
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 route options" }),
  ).toBeVisible();
  await page.getByLabel("Load weight", { exact: true }).fill("41000");
  await expect(
    page.getByText("Showing your last compared trip.", { exact: false }),
  ).toBeVisible();
});

test("ineligible alternatives have an explicit no-recommendation state", async ({
  page,
}) => {
  await locations(page);
  await page.route("**/api/compare", async (route) => {
    const data = comparisonFixture();
    data.routes = [data.routes[2]];
    data.route_count = 1;
    data.recommended_id = null;
    data.explanation =
      "No recommendation: all routes have No Travel conditions.";
    data.warnings = ["Only one distinct route was available."];
    await route.fulfill({ json: data });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await fillTrip(page);
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("No recommendation");
  await expect(page.getByText("Recommended", { exact: true })).toHaveCount(0);
  await page.getByText("Data notes (1)").click();
  await expect(
    page.getByText("Only one distinct route was available."),
  ).toBeVisible();
});

test("390px layout and validation remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await locations(page);
  await page.route("**/api/compare", (route) =>
    route.fulfill({ json: comparisonFixture() }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(
    page.getByText("Select an origin from the suggestions."),
  ).toBeVisible();
  await fillTrip(page);
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 route options" }),
  ).toBeVisible();
  await page
    .getByRole("slider", { name: "Forecast hours after departure" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("switch", { name: "Weather layer" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
