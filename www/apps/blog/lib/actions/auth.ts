"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";

export async function signInWithEmail(email: string, password: string) {
	try {
		const input = z
			.object({
				email: z.email().max(254),
				password: z.string().min(1).max(128),
			})
			.parse({ email, password });
		const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
		if (!adminEmail || input.email.trim().toLowerCase() !== adminEmail)
			return { error: "Invalid credentials" };
		await auth.api.signInEmail({
			body: { email: adminEmail, password: input.password },
			headers: await headers(),
		});
		return { success: true };
	} catch {
		return {
			error: "Sign-in failed. Check your credentials or try again in a minute.",
		};
	}
}

export async function signOutAction() {
	try {
		await auth.api.signOut({ headers: await headers() });
		return { success: true };
	} catch {
		return { error: "Failed to sign out" };
	}
}
