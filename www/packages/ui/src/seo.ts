import type { Metadata } from "next";
import {
	PROFILE_URLS,
	SITE_DESCRIPTION,
	SITE_EMAIL,
	SITE_NAME,
	SITE_PORTRAIT,
	SITE_URL,
	SOURCE_REPOSITORY,
	TALKS,
	TWITTER_HANDLE,
} from "./site";

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
	profile?: boolean;
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
	profile = false,
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
				: profile
					? {
							type: "profile" as const,
							firstName: "Zeyad",
							lastName: "Deeb",
							username: "zeyaddeeb",
						}
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
			creator: TWITTER_HANDLE,
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

const sameAsProfiles = [
	PROFILE_URLS.github,
	PROFILE_URLS.gitlab,
	PROFILE_URLS.linkedin,
	PROFILE_URLS.twitter,
	PROFILE_URLS.crunchbase,
	PROFILE_URLS.orcid,
	PROFILE_URLS.wikidata,
];

const talkVideos = TALKS.map(({ title, published, host, ...video }) => ({
	"@type": "VideoObject",
	"@id": video.url,
	name: title,
	...video,
	uploadDate: published,
	publisher: {
		"@type": "Organization",
		name: host.name,
		url: host.url,
		sameAs: host.wikidata,
	},
}));

const personPortrait = {
	"@type": "ImageObject",
	"@id": siteUrl("/#portrait"),
	url: siteUrl(SITE_PORTRAIT),
	contentUrl: siteUrl(SITE_PORTRAIT),
	caption: SITE_NAME,
	width: 1181,
	height: 1332,
};

const alumniUniversities = [
	{
		"@type": "CollegeOrUniversity",
		name: "University of Illinois Springfield",
		url: "https://www.uis.edu/",
		sameAs: [
			"https://en.wikipedia.org/wiki/University_of_Illinois_Springfield",
			"https://www.wikidata.org/wiki/Q941855",
		],
	},
	{
		"@type": "CollegeOrUniversity",
		name: "University of Maryland",
		url: "https://umd.edu/",
		sameAs: [
			"https://en.wikipedia.org/wiki/University_of_Maryland,_College_Park",
			"https://www.wikidata.org/wiki/Q503415",
		],
	},
	{
		"@type": "CollegeOrUniversity",
		name: "Indiana University",
		url: "https://bloomington.iu.edu/",
		sameAs: [
			"https://en.wikipedia.org/wiki/Indiana_University_Bloomington",
			"https://www.wikidata.org/wiki/Q1079140",
		],
	},
];

export const siteSchema = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Person",
			"@id": siteUrl("/#person"),
			name: SITE_NAME,
			givenName: "Zeyad",
			familyName: "Deeb",
			url: SITE_URL,
			mainEntityOfPage: siteUrl("/about"),
			image: personPortrait,
			jobTitle: "Software Engineer",
			description: SITE_DESCRIPTION,
			email: SITE_EMAIL,
			homeLocation: {
				"@type": "Place",
				name: "Brooklyn, NY",
				address: {
					"@type": "PostalAddress",
					addressLocality: "Brooklyn",
					addressRegion: "NY",
					addressCountry: "US",
				},
			},
			alumniOf: alumniUniversities,
			knowsAbout: [
				"Software Engineering",
				"Machine Learning",
				"Distributed Systems",
				"Rust",
				"TypeScript",
				"WebAssembly",
				"Python",
				"Reinforcement Learning",
				"Kubernetes",
			],
			sameAs: sameAsProfiles,
			subjectOf: talkVideos,
		},
		{
			"@type": "WebSite",
			"@id": siteUrl("/#website"),
			name: SITE_NAME,
			url: SITE_URL,
			description: SITE_DESCRIPTION,
			inLanguage: "en-US",
			author: { "@id": siteUrl("/#person") },
			creator: { "@id": siteUrl("/#person") },
			publisher: { "@id": siteUrl("/#person") },
		},
	],
};

export function profilePageSchema({
	path,
	name,
	description,
	person,
}: {
	path: string;
	name: string;
	description: string;
	person?: Record<string, unknown>;
}) {
	const url = siteUrl(path);

	return {
		"@context": "https://schema.org",
		"@type": "ProfilePage",
		"@id": `${url}#profile`,
		url,
		name,
		description,
		inLanguage: "en-US",
		isPartOf: { "@id": siteUrl("/#website") },
		about: { "@id": siteUrl("/#person") },
		mainEntity: {
			"@type": "Person",
			"@id": siteUrl("/#person"),
			name: SITE_NAME,
			givenName: "Zeyad",
			familyName: "Deeb",
			url: SITE_URL,
			image: personPortrait,
			jobTitle: "Software Engineer",
			description: SITE_DESCRIPTION,
			sameAs: sameAsProfiles,
			subjectOf: talkVideos,
			...person,
		},
	};
}

export function creativeWorkSchema({
	path,
	name,
	description,
	keywords,
	section = "Experiments",
}: {
	path: string;
	name: string;
	description: string;
	keywords?: readonly string[];
	section?: string;
}) {
	const url = siteUrl(path);

	return {
		"@context": "https://schema.org",
		"@type": ["CreativeWork", "SoftwareSourceCode"],
		"@id": `${url}#work`,
		name,
		headline: name,
		description,
		url,
		mainEntityOfPage: url,
		image: socialImageUrl(name, section),
		inLanguage: "en-US",
		codeRepository: SOURCE_REPOSITORY,
		...(keywords?.length
			? {
					keywords: keywords.join(", "),
					programmingLanguage: [...keywords],
				}
			: {}),
		author: { "@id": siteUrl("/#person") },
		creator: { "@id": siteUrl("/#person") },
		isPartOf: { "@id": siteUrl("/#website") },
	};
}
