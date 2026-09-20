import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it } from "vitest";

const execFileAsync = promisify(execFile);

async function withFreshClient(
	source: string,
	nodeEnv: NodeJS.ProcessEnv["NODE_ENV"] = "production",
) {
	await execFileAsync(
		"bun",
		[
			"--eval",
			`
				import assert from "node:assert/strict";
				delete process.env.DATABASE_URL;
				const { db } = await import("./src/client.ts");
				${source}
			`,
		],
		{
			cwd: new URL("../../../packages/db/", import.meta.url),
			env: { ...process.env, NODE_ENV: nodeEnv },
			timeout: 5000,
		},
	);
}

describe("database client initialization", () => {
	it("allows build-time imports but rejects runtime use without credentials", async () => {
		await withFreshClient(`
			assert.throws(() => db.select(), /DATABASE_URL is required in production/);
		`);
	});

	it("reads credentials on first use and reuses the initialized client", async () => {
		await withFreshClient(`
			const { post } = await import("./src/schema/index.ts");
			const connectionString = "postgresql://test:test@localhost:5432/test";
			process.env.DATABASE_URL = connectionString;

			const pool = db.$client;
			try {
				assert.equal(pool.options.connectionString, connectionString);
				assert.ok(db.select().from(post).toSQL().sql.includes('from "posts"'));
				delete process.env.DATABASE_URL;
				assert.equal(db.$client, pool);
			} finally {
				await pool.end();
			}
		`);
	});

	it("preserves the local development connection default", async () => {
		await withFreshClient(
			`
				const pool = db.$client;
				try {
					assert.equal(
						pool.options.connectionString,
						"postgresql://postgres:postgres@localhost:5432/zeyaddeeb",
					);
				} finally {
					await pool.end();
				}
			`,
			"development",
		);
	});
});
