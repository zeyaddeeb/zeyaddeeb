import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("database client initialization", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("DATABASE_URL", undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("allows build-time imports but rejects runtime use without credentials", async () => {
		const { db } = await import("../../../packages/db/src/client");

		expect(() => db.select()).toThrow("DATABASE_URL is required in production");
	});

	it("reads credentials on first use and reuses the initialized client", async () => {
		const { db } = await import("../../../packages/db/src/client");
		const { post } = await import("../../../packages/db/src/schema");
		const connectionString = "postgresql://test:test@localhost:5432/test";
		vi.stubEnv("DATABASE_URL", connectionString);

		const pool = db.$client;
		try {
			expect(pool.options.connectionString).toBe(connectionString);
			expect(db.select().from(post).toSQL().sql).toContain('from "posts"');
			vi.stubEnv("DATABASE_URL", undefined);
			expect(db.$client).toBe(pool);
		} finally {
			await pool.end();
		}
	});

	it("preserves the local development connection default", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const { db } = await import("../../../packages/db/src/client");
		const pool = db.$client;
		try {
			expect(pool.options.connectionString).toBe(
				"postgresql://postgres:postgres@localhost:5432/zeyaddeeb",
			);
		} finally {
			await pool.end();
		}
	});
});
