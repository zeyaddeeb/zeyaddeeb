import { initAuth } from "@zeyaddeeb/auth/index";

const isDev = process.env.NODE_ENV !== "production";
const baseUrl = isDev
	? "http://localhost:3001/blog"
	: process.env.BASE_URL || "https://www.zeyaddeeb.com/blog";
const productionUrl =
	process.env.PRODUCTION_URL || "https://www.zeyaddeeb.com/blog";

export const auth = initAuth({
	baseUrl,
	productionUrl,
	secret: process.env.BETTER_AUTH_SECRET,
	basePath: "/api/auth",
});
