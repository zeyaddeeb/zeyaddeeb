/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	reactStrictMode: true,
	transpilePackages: ["@zeyaddeeb/ui", "@zeyaddeeb/wasm"],

	async rewrites() {
		return process.env.NODE_ENV === "development"
			? [
					{
						source: "/blog/:path*",
						destination: "http://127.0.0.1:3001/blog/:path*",
					},
				]
			: [];
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
