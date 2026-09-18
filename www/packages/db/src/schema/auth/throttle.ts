import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const authThrottle = pgTable("auth_throttle", {
	key: text("key").primaryKey(),
	attempts: integer("attempts").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
