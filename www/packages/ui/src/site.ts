declare const process: { env: { NODE_ENV?: string } };

export const SITE_URL = "https://www.zeyaddeeb.com";
export const SITE_NAME = "Zeyad Deeb";
export const SITE_DESCRIPTION =
	"Software engineer in Brooklyn building machine learning and distributed systems. Rust, TypeScript, and WebAssembly projects, experiments, and technical writing.";

export const SITE_EMAIL = "me@zeyaddeeb.com";
export const SITE_PORTRAIT = "/headshot.png";
export const TWITTER_HANDLE = "@zeyad_deeb";
export const PROFILE_URLS = {
	github: "https://github.com/zeyaddeeb",
	linkedin: "https://www.linkedin.com/in/zeyaddeeb",
	twitter: "https://twitter.com/zeyad_deeb",
	crunchbase: "https://www.crunchbase.com/person/zeyad-deeb",
	wikidata: "https://www.wikidata.org/wiki/Q141774047",
} as const;
export const SOURCE_REPOSITORY = `${PROFILE_URLS.github}/zeyaddeeb`;

export const BLOG_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3001/blog"
		: "/blog";
