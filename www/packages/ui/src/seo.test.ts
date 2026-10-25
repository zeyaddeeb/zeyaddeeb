import { describe, expect, it } from "vitest";
import {
	creativeWorkSchema,
	listingMetadata,
	pageMetadata,
	pageNumber,
	profilePageSchema,
	serializeJsonLd,
	siteSchema,
	siteUrl,
} from "./seo";
import { PROFILE_URLS } from "./site";

describe("public metadata", () => {
	it("keeps the document and social titles in sync without nested title suffixes", () => {
		const metadata = pageMetadata({
			title: "CRDT Editor",
			description: "Collaborative editing in Rust.",
			path: "/experiments/crdt",
		});

		expect(metadata.title).toEqual({ absolute: "CRDT Editor | Zeyad Deeb" });
		expect(metadata.openGraph?.title).toBe("CRDT Editor | Zeyad Deeb");
		expect(metadata.twitter?.title).toBe(metadata.openGraph?.title);

		expect(metadata.alternates?.canonical).toBe(
			"https://www.zeyaddeeb.com/experiments/crdt",
		);
	});

	it("gives each paginated listing its own canonical URL", () => {
		const metadata = listingMetadata({
			title: "Library",
			description: "Saved references.",
			path: "/blog/library",
			page: "2",
		});

		expect(metadata.alternates?.canonical).toBe(
			"https://www.zeyaddeeb.com/blog/library?page=2",
		);

		expect(metadata.robots).toMatchObject({ index: true, follow: true });
	});

	it("excludes filtered searches while preserving their query and pagination", () => {
		const metadata = listingMetadata({
			title: "Library",
			description: "Saved references.",
			path: "/blog/library",
			page: "3",
			filters: { q: " rust & wasm ", type: "book" },
		});

		const url = new URL(String(metadata.alternates?.canonical));

		expect(url.pathname).toBe("/blog/library");
		expect(url.searchParams.get("q")).toBe("rust & wasm");
		expect(url.searchParams.get("page")).toBe("3");
		expect(metadata.robots).toMatchObject({ index: false, follow: true });
	});

	it("normalizes invalid pages and empty filters", () => {
		for (const value of [undefined, "-1", "0", "1.5", "NaN", "Infinity"]) {
			expect(pageNumber(value)).toBe(1);
		}

		const metadata = listingMetadata({
			title: "Blog",
			description: "Articles.",
			path: "/blog/posts",
			page: "1",
			filters: { search: " " },
		});

		expect(metadata.alternates?.canonical).toBe(siteUrl("/blog/posts"));
		expect(metadata.robots).toMatchObject({ index: true });
	});

	it("does not invent dimensions for uploaded social images", () => {
		const metadata = pageMetadata({
			title: "A book",
			description: "A saved book.",
			path: "/blog/library/a-book",
			image: "https://example.com/portrait.jpg",
		});

		expect(metadata.openGraph?.images).toEqual([
			{ url: "https://example.com/portrait.jpg", alt: "A book" },
		]);
	});

	it("escapes script delimiters in structured data without losing content", () => {
		const data = { headline: '</script><script>alert("test")</script>' };
		const serialized = serializeJsonLd(data);

		expect(serialized).not.toContain("<");
		expect(JSON.parse(serialized)).toEqual(data);
	});

	it("emits profile OpenGraph metadata and Twitter creator handle when requested", () => {
		const metadata = pageMetadata({
			title: "About",
			description: "About Zeyad Deeb.",
			path: "/about",
			profile: true,
		});

		expect(metadata.openGraph).toMatchObject({
			type: "profile",
			firstName: "Zeyad",
			lastName: "Deeb",
			username: "zeyaddeeb",
		});
		expect(metadata.twitter).toMatchObject({
			card: "summary_large_image",
			creator: "@zeyad_deeb",
		});
	});

	it("includes full Person entity attributes, portrait, and sameAs links in siteSchema", () => {
		const [person, website] = siteSchema["@graph"];

		expect(person).toMatchObject({
			"@type": "Person",
			"@id": "https://www.zeyaddeeb.com/#person",
			name: "Zeyad Deeb",
			givenName: "Zeyad",
			familyName: "Deeb",
			mainEntityOfPage: "https://www.zeyaddeeb.com/about",
			image: {
				"@type": "ImageObject",
				"@id": "https://www.zeyaddeeb.com/#portrait",
				url: "https://www.zeyaddeeb.com/headshot.png",
				width: 1181,
				height: 1332,
			},
			sameAs: [
				PROFILE_URLS.github,
				PROFILE_URLS.gitlab,
				PROFILE_URLS.linkedin,
				PROFILE_URLS.twitter,
				PROFILE_URLS.crunchbase,
				PROFILE_URLS.orcid,
				PROFILE_URLS.wikidata,
			],
			subjectOf: [
				{
					"@type": "VideoObject",
					"@id": "https://www.youtube.com/watch?v=yLw9MvNfuY8",
					uploadDate: "2024-10-17",
					publisher: { "@type": "Organization", name: "SurrealDB" },
				},
			],
		});
		expect(website).toMatchObject({
			"@type": "WebSite",
			"@id": "https://www.zeyaddeeb.com/#website",
			author: { "@id": "https://www.zeyaddeeb.com/#person" },
			creator: { "@id": "https://www.zeyaddeeb.com/#person" },
			publisher: { "@id": "https://www.zeyaddeeb.com/#person" },
		});
	});

	it("builds ProfilePage and CreativeWork schemas linked to the canonical Person entity", () => {
		const profile = profilePageSchema({
			path: "/about",
			name: "About Zeyad Deeb",
			description: "Software engineer in Brooklyn.",
		});

		expect(profile).toMatchObject({
			"@type": "ProfilePage",
			"@id": "https://www.zeyaddeeb.com/about#profile",
			mainEntity: {
				"@type": "Person",
				"@id": "https://www.zeyaddeeb.com/#person",
				name: "Zeyad Deeb",
			},
		});

		const work = creativeWorkSchema({
			path: "/experiments/crdt",
			name: "CRDT Editor",
			description: "Collaborative text editing.",
			keywords: ["Rust", "WASM"],
		});

		expect(work).toMatchObject({
			"@type": ["CreativeWork", "SoftwareSourceCode"],
			"@id": "https://www.zeyaddeeb.com/experiments/crdt#work",
			author: { "@id": "https://www.zeyaddeeb.com/#person" },
			creator: { "@id": "https://www.zeyaddeeb.com/#person" },
			programmingLanguage: ["Rust", "WASM"],
		});
	});
});
