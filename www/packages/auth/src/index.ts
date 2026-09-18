import { db } from "@zeyaddeeb/db";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { consumeLoginAttempt } from "./throttle";

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
			disableSignUp: true,
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/sign-in/email" && !(await consumeLoginAttempt())) {
					throw new APIError("TOO_MANY_REQUESTS", {
						message: "Too many sign-in attempts. Try again in a minute.",
					});
				}
			}),
		},
		plugins: [...(options.extraPlugins ?? [])],
		socialProviders: {},
		onAPIError: {
			onError() {
				console.error("Authentication request failed");
			},
		},
	} satisfies BetterAuthOptions;

	return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
