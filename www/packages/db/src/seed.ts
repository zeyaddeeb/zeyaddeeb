import { account, collectionItem, db, post, user } from "@zeyaddeeb/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { blogPostsSeedData, collectionItemsSeedData } from "./seed-data";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_ID = process.env.ADMIN_ID || "admin";

async function seedAdminUser() {
	console.log("Seeding admin user...");

	if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
		throw new Error(
			"ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required",
		);
	}

	const normalizedEmail = ADMIN_EMAIL.toLowerCase();
	const hashedPassword = await hashPassword(ADMIN_PASSWORD);

	const [adminUser] = await db
		.insert(user)
		.values({
			id: ADMIN_ID,
			email: normalizedEmail,
			name: ADMIN_NAME,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.onConflictDoNothing({ target: user.email })
		.returning({ id: user.id });

	if (adminUser) {
		console.log("Admin user created");
	} else {
		console.log("Admin user already exists");
	}

	const credentialAccountId = `${ADMIN_ID}-credential`;

	await db.delete(account).where(eq(account.userId, ADMIN_ID));

	await db.insert(account).values({
		id: credentialAccountId,
		userId: ADMIN_ID,
		accountId: ADMIN_ID,
		providerId: "credential",
		password: hashedPassword,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	console.log("Admin account ensured");

	return ADMIN_ID;
}

async function seedCollectionItems(authorId: string) {
	console.log("Seeding collection items...");

	if (collectionItemsSeedData.length === 0) {
		console.log("No collection items seed data, skipping...");
		return;
	}

	const itemsWithAuthor = collectionItemsSeedData.map((item) => ({
		...item,
		authorId,
	}));

	const inserted = await db
		.insert(collectionItem)
		.values(itemsWithAuthor)
		.onConflictDoNothing({ target: collectionItem.slug })
		.returning({ id: collectionItem.id });

	console.log(
		`Seeded ${inserted.length} collection items (${collectionItemsSeedData.length - inserted.length} already existed)`,
	);
}

async function seedBlogPosts(authorId: string) {
	console.log("Seeding blog posts...");

	if (blogPostsSeedData.length === 0) {
		console.log("No blog posts seed data, skipping...");
		return;
	}

	const postsWithAuthor = blogPostsSeedData.map((p) => ({
		...p,
		authorId,
	}));

	const inserted = await db
		.insert(post)
		.values(postsWithAuthor)
		.onConflictDoNothing({ target: post.slug })
		.returning({ id: post.id });

	console.log(
		`Seeded ${inserted.length} blog posts (${blogPostsSeedData.length - inserted.length} already existed)`,
	);
}

async function seed() {
	const authorId = await seedAdminUser();
	await seedCollectionItems(authorId);
	await seedBlogPosts(authorId);
}

seed()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
