import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "../auth/user";

export const post = pgTable("posts", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text("title").notNull(),
	slug: text("slug").notNull().unique(),
	content: text("content").notNull(),
	excerpt: text("excerpt"),
	coverImage: text("cover_image"),
	published: boolean("published").default(false).notNull(),
	authorId: text("author_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	publishedAt: timestamp("published_at"),
});

export const postRelations = relations(post, ({ one }) => ({
	author: one(user, {
		fields: [post.authorId],
		references: [user.id],
	}),
}));

export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;
