/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/blog",
	output: "standalone",
	reactStrictMode: true,
	transpilePackages: ["@zeyaddeeb/ui", "@zeyaddeeb/db"],
	agentRules: false,
	experimental: {
		scrollRestoration: true,
	},

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
		],
	},
};

export default nextConfig;
