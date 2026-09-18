/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	reactStrictMode: true,
	async headers() {
		const csp = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'" +
				(process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' https: data: blob:",
			"font-src 'self' data:",
			"connect-src 'self' https: wss:" +
				(process.env.NODE_ENV === "development"
					? " http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
					: ""),
			"media-src 'self' blob: https:",
			"frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://embed.music.apple.com",
			"worker-src 'self' blob:",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'",
		].join("; ");
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "Content-Security-Policy", value: csp },
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains",
					},
				],
			},
		];
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
