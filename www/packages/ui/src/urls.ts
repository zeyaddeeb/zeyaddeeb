declare const process: { env: { NODE_ENV?: string } };

export const BLOG_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3001/blog"
		: "/blog";
