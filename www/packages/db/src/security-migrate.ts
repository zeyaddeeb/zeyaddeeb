import { sql } from "drizzle-orm";
import { db } from "./client";

try {
	await db.execute(sql`CREATE TABLE IF NOT EXISTS auth_throttle (
        key text PRIMARY KEY,
        attempts integer NOT NULL,
        expires_at timestamptz NOT NULL
    )`);
} finally {
	await db.$client.end();
}
