import { db } from "@zeyaddeeb/db";
import { sql } from "drizzle-orm";

export async function consumeLoginAttempt(): Promise<boolean> {
	const result = await db.execute(sql`
 INSERT INTO auth_throttle (key, attempts, expires_at)
 VALUES ('admin-login', 1, now() + interval '1 minute')
 ON CONFLICT (key) DO UPDATE SET
 attempts = CASE WHEN auth_throttle.expires_at <= now() THEN 1 ELSE auth_throttle.attempts + 1 END,
 expires_at = CASE WHEN auth_throttle.expires_at <= now() THEN now() + interval '1 minute' ELSE auth_throttle.expires_at END
 WHERE auth_throttle.expires_at <= now() OR auth_throttle.attempts < 10
 RETURNING key`);
	return result.rows.length === 1;
}
