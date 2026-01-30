/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/blog",
	output: "standalone",
	reactStrictMode: true,
	transpilePackages: ["@zeyaddeeb/ui", "@zeyaddeeb/db"],

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
