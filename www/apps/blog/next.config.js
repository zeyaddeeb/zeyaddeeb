import { remoteImages, securityHeaders } from "@zeyaddeeb/config/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/blog",
	output: "standalone",
	reactStrictMode: true,
	async headers() {
		return securityHeaders();
	},
	transpilePackages: ["@zeyaddeeb/ui", "@zeyaddeeb/db"],
	agentRules: false,
	experimental: {
		scrollRestoration: true,
	},
	images: remoteImages,
};

export default nextConfig;
