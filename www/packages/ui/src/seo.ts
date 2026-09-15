import type { Metadata } from "next";

export const SITE_URL = "https://www.zeyaddeeb.com";
export const SITE_NAME = "Zeyad Deeb";
export const SITE_DESCRIPTION =
	"Software engineer in Brooklyn building machine learning and distributed systems. Rust, TypeScript, and WebAssembly projects, experiments, and technical writing.";

export function siteUrl(path = "/") {
	return new URL(path, SITE_URL).toString();
}

export function socialImageUrl(
	title: string,
	section = "Software engineering",
) {
	const query = new URLSearchParams({ title, section });
	return siteUrl(`/og?${query}`);
}

interface PageMetadataOptions {
	title: string;
	description: string;
	path: string;
	section?: string;
	image?: string | null;
	noIndex?: boolean;
	article?: {
		publishedTime?: string;
		modifiedTime?: string;
		tags?: string[];
	};
}

export function pageMetadata({
	title,
	description,
	path,
	section,
	image,
	noIndex = false,
	article,
}: PageMetadataOptions): Metadata {
	const fullTitle =
		title === SITE_NAME
			? `${SITE_NAME} | Software Engineer`
			: `${title} | ${SITE_NAME}`;
	const url = siteUrl(path);
	const imageUrl = image ? siteUrl(image) : socialImageUrl(title, section);
	const images = [
		{
			url: imageUrl,
			alt: title,
			// Uploaded covers keep their original dimensions.
			...(!image ? { width: 1200, height: 630 } : {}),
		},
	];

	return {
		metadataBase: new URL(SITE_URL),
		title: { absolute: fullTitle },
		description,
		alternates: { canonical: url },
		authors: [{ name: SITE_NAME, url: siteUrl("/about") }],
		creator: SITE_NAME,
		robots: {
			index: !noIndex,
			follow: true,
			googleBot: {
				index: !noIndex,
				follow: true,
				"max-image-preview": "large",
				"max-snippet": -1,
				"max-video-preview": -1,
			},
		},
		openGraph: {
			...(article
				? { type: "article" as const, ...article, authors: [siteUrl("/about")] }
				: { type: "website" as const }),
			locale: "en_US",
			siteName: SITE_NAME,
			title: fullTitle,
			description,
			url,
			images,
		},
		twitter: {
			card: "summary_large_image",
			title: fullTitle,
			description,
			images,
		},
	};
}

export function pageNumber(value?: string) {
	const page = Number(value);
	return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function listingMetadata({
	page,
	filters = {},
	...options
}: Omit<PageMetadataOptions, "noIndex"> & {
	page?: string;
	filters?: Record<string, string | undefined>;
}) {
	const number = pageNumber(page);
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value?.trim()) query.set(key, value.trim());
	}
	const noIndex = query.size > 0;
	if (number > 1) query.set("page", String(number));
	return pageMetadata({
		...options,
		title: number > 1 ? `${options.title} — Page ${number}` : options.title,
		path: `${options.path}${query.size ? `?${query}` : ""}`,
		noIndex,
	});
}

export function serializeJsonLd(data: unknown) {
	return JSON.stringify(data).replace(/</g, "\\u003c");
}

export const siteSchema = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Person",
			"@id": siteUrl("/#person"),
			name: SITE_NAME,
			url: SITE_URL,
			jobTitle: "Software Engineer",
			description: SITE_DESCRIPTION,
			sameAs: [
				"https://github.com/zeyaddeeb",
				"https://www.linkedin.com/in/zeyaddeeb",
			],
		},
		{
			"@type": "WebSite",
			"@id": siteUrl("/#website"),
			name: SITE_NAME,
			url: SITE_URL,
			description: SITE_DESCRIPTION,
			inLanguage: "en-US",
			publisher: { "@id": siteUrl("/#person") },
		},
	],
};
