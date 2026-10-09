import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprint, grouped, marks, studyLine } from "./seal";

describe("seal", () => {
	it("fingerprints the sealed line with sha-256", async () => {
		const line = studyLine(7, 1, "9c1f2a3b4c5d6e7f");

		expect(line).toBe("round 7 full 9c1f2a3b4c5d6e7f");
		expect(await fingerprint(line)).toBe(
			createHash("sha256").update(line).digest("hex"),
		);
	});

	it("draws nine marks from the fingerprint", () => {
		const hash = createHash("sha256").update("x").digest("hex");
		const drawn = marks(hash);

		expect(drawn).toHaveLength(9);
		expect(marks(hash)).toEqual(drawn);
		expect(drawn.every((m) => m.turn >= 0 && m.turn < 4)).toBe(true);
		expect(grouped(hash)).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
	});
});
