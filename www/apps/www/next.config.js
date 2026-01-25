import { fileURLToPath } from "node:url";

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
