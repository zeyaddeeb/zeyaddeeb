import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFullPath } from "@/lib/redirect-utils";
import { isAdmin } from "@/lib/session";

function buildRedirectUrl(path: string, request: NextRequest): URL {
	const url = new URL(request.url);
	url.pathname = getFullPath(path);
	return url;
}

export async function proxy(request: NextRequest) {
	const isWriteRoute = request.nextUrl.pathname.startsWith("/write");
	const isLoginRoute = request.nextUrl.pathname === "/write/login";
	const isAuthApiRoute = request.nextUrl.pathname.startsWith("/api/auth");

	if (isAuthApiRoute) {
		return NextResponse.next();
	}

	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!process.env.ADMIN_ID) {
		return NextResponse.redirect(buildRedirectUrl("/write/login", request));
	}

	if (isLoginRoute) {
		if (isAdmin(session?.user)) {
			return NextResponse.redirect(
				buildRedirectUrl("/write/dashboard", request),
			);
		}
		return NextResponse.next();
	}

	if (isWriteRoute) {
		if (!isAdmin(session?.user)) {
			return NextResponse.redirect(buildRedirectUrl("/write/login", request));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/write/:path*", "/api/auth/:path*"],
};
