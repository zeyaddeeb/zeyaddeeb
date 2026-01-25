"use server";

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

function parseSetCookieHeader(setCookieHeader: string) {
	const cookieStrings = setCookieHeader.split(/,(?=\s*[^;=]+=[^;]*)/g);
	const parsedCookies: Array<{
		name: string;
		value: string;
		options: {
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: "lax" | "strict" | "none";
			path?: string;
			maxAge?: number;
		};
	}> = [];

	for (const cookieString of cookieStrings) {
		const parts = cookieString.trim().split(";");
		const [nameValue, ...attributes] = parts;
		const equalIndex = nameValue.indexOf("=");
		if (equalIndex === -1) continue;

		const name = nameValue.substring(0, equalIndex).trim();
		const value = nameValue.substring(equalIndex + 1).trim();

		const options: {
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: "lax" | "strict" | "none";
			path?: string;
			maxAge?: number;
		} = {};

		for (const attr of attributes) {
			const [attrName, attrValue] = attr.split("=").map((s) => s.trim());
			const attrNameLower = attrName.toLowerCase();

			switch (attrNameLower) {
				case "httponly":
					options.httpOnly = true;
					break;
				case "secure":
					options.secure = true;
					break;
				case "samesite":
					options.sameSite = attrValue?.toLowerCase() as
						| "lax"
						| "strict"
						| "none";
					break;
				case "path":
					options.path = attrValue;
					break;
				case "max-age":
					options.maxAge = Number.parseInt(attrValue, 10);
					break;
			}
		}

		parsedCookies.push({ name, value, options });
	}

	return parsedCookies;
}

export async function signInWithEmail(email: string, password: string) {
	try {
		const result = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			asResponse: true,
		});

		if (!result.ok) {
			return { error: "Invalid credentials" };
		}

		const cookieStore = await cookies();
		const setCookieHeader = result.headers.get("set-cookie");
		if (setCookieHeader) {
			const parsedCookies = parseSetCookieHeader(setCookieHeader);
			for (const { name, value, options } of parsedCookies) {
				const decodedValue = decodeURIComponent(value);
				cookieStore.set(name, decodedValue, {
					httpOnly: true,
					secure: true,
					sameSite: "strict",
					path: "/",
					...(options.maxAge && { maxAge: options.maxAge }),
				});
			}
		}

		return { success: true };
	} catch {
		return { error: "Invalid credentials" };
	}
}

export async function signOutAction() {
	try {
		const cookieStore = await cookies();
		cookieStore.delete("better-auth.session_token");
		return { success: true };
	} catch {
		return { error: "Failed to sign out" };
	}
}
