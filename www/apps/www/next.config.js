import process from "node:process";
import { fileURLToPath } from "node:url";

const BLOG_URL =
	process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001/blog";

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	reactStrictMode: true,
	transpilePackages: ["@zeyaddeeb/ui"],

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
		],
	},

	async redirects() {
		return [
			{
				source: "/blog",
				destination: BLOG_URL,
				permanent: false,
			},
			{
				source: "/blog/:path*",
				destination: `${BLOG_URL}/:path*`,
				permanent: false,
			},
		];
	},

	experimental: {
		turbo: {
			resolveAlias: {
				"@zeyaddeeb/ui": fileURLToPath(
					new URL("../../packages/ui/src", import.meta.url),
				),
			},
		},
	},
};

export default nextConfig;
