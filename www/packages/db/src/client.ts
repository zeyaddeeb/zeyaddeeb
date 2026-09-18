import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb() {
	if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required in production");
	}
	const connectionString =
		process.env.DATABASE_URL ||
		"postgresql://postgres:postgres@localhost:5432/zeyaddeeb";
	const pool = new Pool({ connectionString });
	return drizzle(pool, { schema });
}

export type DB = ReturnType<typeof createDb>;

let instance: DB | undefined;

export const db = new Proxy({} as DB, {
	get(_target, property) {
		instance ??= createDb();
		const client = instance;
		const value = Reflect.get(client, property, client);
		return typeof value === "function" ? value.bind(client) : value;
	},
});
