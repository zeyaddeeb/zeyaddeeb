import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const isProduction = process.env.NODE_ENV === "production";

function createDb() {
	if (isProduction) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error(
				"DATABASE_URL environment variable is required in production",
			);
		}
		const pool = new Pool({ connectionString });

		return drizzlePg(pool, { schema });
	}

	const sqlitePath = process.env.DATABASE_URL || "local.db";
	const sqlite = new Database(sqlitePath);
	return drizzleSqlite(sqlite, { schema });
}

export const db = createDb();

export type DB = typeof db;
