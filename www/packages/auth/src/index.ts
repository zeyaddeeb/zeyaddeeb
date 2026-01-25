import { db } from "@zeyaddeeb/db";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";

export function initAuth<
	TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
	baseUrl: string;
	productionUrl: string;
	secret: string | undefined;
	basePath?: string;
	extraPlugins?: TExtraPlugins;
}) {
	const config = {
		database: drizzleAdapter(db, {
			provider: "pg",
		}),
		baseURL: options.baseUrl,
		basePath: options.basePath,
		secret: options.secret,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [
			oAuthProxy({
				productionURL: options.productionUrl,
			}),
			...(options.extraPlugins ?? []),
		],
		socialProviders: {},
		onAPIError: {
			onError(error, ctx) {
				console.error("BETTER AUTH API ERROR", error, ctx);
			},
		},
	} satisfies BetterAuthOptions;

	return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
