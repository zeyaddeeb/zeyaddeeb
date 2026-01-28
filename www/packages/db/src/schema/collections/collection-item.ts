import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth/user";

export const collectionItemTypeEnum = pgEnum("collection_item_type", [
	"wikipedia",
	"art",
	"book",
	"youtube",
	"product",
	"music",
	"article",
	"podcast",
	"movie",
	"github",
	"other",
]);

export const collectionItem = pgTable("collection_items", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	type: collectionItemTypeEnum("type").notNull(),
	title: text("title").notNull(),
	slug: text("slug").notNull().unique(),
	description: text("description"),
	url: text("url"),
	imageUrl: text("image_url"),
	thumbnailUrl: text("thumbnail_url"),
	accentColor: text("accent_color"),
	gridSize: text("grid_size").default("medium"),
	displayOrder: integer("display_order").default(0),
	metadata: jsonb("metadata").$type<CollectionItemMetadata>(),
	tags: text("tags").array(),
	featured: boolean("featured").default(false).notNull(),
	published: boolean("published").default(false).notNull(),
	authorId: text("author_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const collectionItemRelations = relations(collectionItem, ({ one }) => ({
	author: one(user, {
		fields: [collectionItem.authorId],
		references: [user.id],
	}),
}));

export interface WikipediaMetadata {
	wikiPageId?: string;
	extract?: string;
	categories?: string[];
}

export interface ArtMetadata {
	artist?: string;
	year?: number;
	medium?: string;
	dimensions?: string;
	museum?: string;
	style?: string;
}

export interface BookMetadata {
	author?: string;
	isbn?: string;
	publishedYear?: number;
	publisher?: string;
	pages?: number;
	genre?: string[];
	quote?: string;
}

export interface YouTubeMetadata {
	channelId?: string;
	subscriberCount?: number;
	videoCount?: number;
	category?: string;
	videoId?: string;
	channelName?: string;
	duration?: string;
	viewCount?: number;
	publishedAt?: string;
	isChannel?: boolean;
}

export interface ProductMetadata {
	brand?: string;
	price?: number;
	currency?: string;
	category?: string;
	purchaseUrl?: string;
	color?: string;
	size?: string;
}

export interface MusicMetadata {
	artist?: string;
	album?: string;
	year?: number;
	genre?: string[];
	spotifyUrl?: string;
	appleMusicUrl?: string;
}

export interface ArticleMetadata {
	author?: string;
	publication?: string;
	publishedDate?: string;
	readingTime?: number;
}

export interface PodcastMetadata {
	host?: string;
	episodeNumber?: number;
	duration?: string;
	spotifyUrl?: string;
	applePodcastsUrl?: string;
}

export interface MovieMetadata {
	director?: string;
	year?: number;
	genre?: string[];
	runtime?: number;
	imdbId?: string;
	imdbRating?: number;
	cast?: string[];
	streamingPlatform?: string;
}

export interface GitHubMetadata {
	owner?: string;
	repo?: string;
	stars?: number;
	forks?: number;
	language?: string;
	topics?: string[];
	license?: string;
	description?: string;
}

export type CollectionItemMetadata =
	| WikipediaMetadata
	| ArtMetadata
	| BookMetadata
	| YouTubeMetadata
	| ProductMetadata
	| MusicMetadata
	| ArticleMetadata
	| PodcastMetadata
	| MovieMetadata
	| GitHubMetadata
	| Record<string, unknown>;

export type CollectionItem = typeof collectionItem.$inferSelect;
export type NewCollectionItem = typeof collectionItem.$inferInsert;
export type CollectionItemType =
	(typeof collectionItemTypeEnum.enumValues)[number];
