import type { Session } from "@zeyaddeeb/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type SessionUser = Session["user"];

export function isAdmin(user: Pick<SessionUser, "id"> | undefined): boolean {
	const adminId = process.env.ADMIN_ID;

	return Boolean(adminId && user?.id === adminId);
}

export async function getSession(): Promise<Session | null> {
	return auth.api.getSession({ headers: await headers() });
}

export async function requireAdminPage(): Promise<SessionUser | null> {
	const session = await getSession();

	if (!session?.user) redirect("/write/login");

	return isAdmin(session.user) ? session.user : null;
}
