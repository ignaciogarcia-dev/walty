import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
	it("merges tailwind classes without duplication", () => {
		expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
	});

	it("handles conditional classes", () => {
		expect(cn("base", false && "hidden", "block")).toBe("base block");
	});
});
