import { expect, test } from "@playwright/test";

test.describe("Landing", () => {
	test("loads with Walty title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Walty/);
	});
});
