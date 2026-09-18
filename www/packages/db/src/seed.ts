import { account, collectionItem, db, post, user } from "@zeyaddeeb/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { blogPostsSeedData, collectionItemsSeedData } from "./seed-data";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_ID = process.env.ADMIN_ID;

async function seedAdminUser() {
	console.log("Seeding admin user...");

	if (!ADMIN_EMAIL?.trim() || !ADMIN_ID?.trim()) {
		throw new Error("ADMIN_EMAIL and ADMIN_ID are required");
	}
	const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase();
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, normalizedEmail));
	if (existing) {
		if (existing.id !== ADMIN_ID)
			throw new Error("Existing admin email belongs to a different ID");
		return ADMIN_ID;
	}
	if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
		throw new Error(
			"Initial provisioning requires ADMIN_PASSWORD of at least 16 characters",
		);
	}
	const hashedPassword = await hashPassword(ADMIN_PASSWORD);
	await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(user)
			.values({
				id: ADMIN_ID,
				email: normalizedEmail,
				name: ADMIN_NAME,
				emailVerified: true,
			})
			.onConflictDoNothing({ target: user.email })
			.returning({ id: user.id });
		if (!created) {
			const [current] = await tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, normalizedEmail));
			if (current?.id !== ADMIN_ID)
				throw new Error("Existing admin email belongs to a different ID");
			return;
		}
		await tx.insert(account).values({
			id: `${ADMIN_ID}-credential`,
			userId: ADMIN_ID,
			accountId: ADMIN_ID,
			providerId: "credential",
			password: hashedPassword,
			updatedAt: new Date(),
		});
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
