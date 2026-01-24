import { defineConfig } from "drizzle-kit";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig(
	isProduction
		? {
				schema: "./src/schema/index.ts",
				out: "./drizzle",
				dialect: "postgresql",
				dbCredentials: {
					url: process.env.DATABASE_URL,
				},
			}
		: {
				schema: "./src/schema/index.ts",
				out: "./drizzle",
				dialect: "sqlite",
				dbCredentials: {
					url: process.env.DATABASE_URL || "local.db",
				},
			},
);
