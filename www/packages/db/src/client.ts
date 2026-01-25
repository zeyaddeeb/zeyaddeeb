import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is required");
	}
	const pool = new Pool({ connectionString });
	return drizzle(pool, { schema });
}

export const db = createDb();

export type DB = typeof db;
