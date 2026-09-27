import { remoteImages, securityHeaders } from "@zeyaddeeb/config/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	reactStrictMode: true,
	async headers() {
		return securityHeaders({
			frameSrc: [
				"https://www.pulsarlabs.io",
				"https://www.pulvi.co",
				"https://www.moonspell.fm",
				"https://www.cosmicelements.io",
			],
		});
	},
	transpilePackages: ["@zeyaddeeb/ui", "@zeyaddeeb/wasm"],
	agentRules: false,
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
	images: remoteImages,
};

export default nextConfig;
