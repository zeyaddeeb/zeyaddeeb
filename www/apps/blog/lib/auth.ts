import { initAuth } from "@zeyaddeeb/auth/index";
import { SITE_URL } from "@zeyaddeeb/ui/site";
import { nextCookies } from "better-auth/next-js";

const isDev = process.env.NODE_ENV !== "production";
const baseUrl = isDev
	? "http://localhost:3001"
	: process.env.BASE_URL || SITE_URL;
const productionUrl = process.env.PRODUCTION_URL || SITE_URL;

export const auth = initAuth({
	baseUrl,
	productionUrl,
	secret: process.env.BETTER_AUTH_SECRET,
	basePath: "/blog/api/auth",
	extraPlugins: [nextCookies()],
});
