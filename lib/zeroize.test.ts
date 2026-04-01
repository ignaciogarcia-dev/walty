import { describe, expect, it } from "vitest";
import { withZeroized, zeroize } from "./zeroize";

describe("zeroize", () => {
	it("fills buffer with zeros", () => {
		const buf = new Uint8Array([1, 2, 3]);
		zeroize(buf);
		expect(Array.from(buf)).toEqual([0, 0, 0]);
	});
});

describe("withZeroized", () => {
	it("returns fn result and clears buffer after", async () => {
		const result = await withZeroized("secret", (bytes) => {
			expect(new TextDecoder().decode(bytes)).toBe("secret");
			return 42;
		});
		expect(result).toBe(42);
	});
});
