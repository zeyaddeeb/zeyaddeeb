import { account, db, user } from "@zeyaddeeb/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_ID = process.env.ADMIN_ID || "admin";

async function seed() {
	console.log("Seeding admin user...");

	if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
		throw new Error(
			"ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required",
		);
	}

	const existing = await db
		.select()
		.from(user)
		.where(eq(user.email, ADMIN_EMAIL))
		.limit(1);

	const [admin] = existing;

	if (admin) {
		console.log("Admin user already exists:", admin.id);
		return;
	}

	const hashedPassword = await hashPassword(ADMIN_PASSWORD);

	await db.insert(user).values({
		id: ADMIN_ID,
		email: ADMIN_EMAIL,
		name: ADMIN_NAME,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	await db.insert(account).values({
		id: crypto.randomUUID(),
		userId: ADMIN_ID,
		accountId: ADMIN_ID,
		providerId: "credential",
		password: hashedPassword,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	console.log("Admin user created");
}

seed()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
