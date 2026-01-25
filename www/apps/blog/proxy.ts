import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ALLOWED_ADMIN_ID = process.env.ADMIN_ID || "admin";
const BASE_PATH = "/blog";

function buildRedirectUrl(path: string, request: NextRequest): URL {
	const url = new URL(request.url);
	url.pathname = path.startsWith(BASE_PATH) ? path : `${BASE_PATH}${path}`;
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

	if (!ALLOWED_ADMIN_ID) {
		return NextResponse.redirect(buildRedirectUrl("/write/login", request));
	}

	if (isLoginRoute) {
		if (session?.user?.id === ALLOWED_ADMIN_ID) {
			return NextResponse.redirect(
				buildRedirectUrl("/write/dashboard", request),
			);
		}
		return NextResponse.next();
	}

	if (isWriteRoute) {
		if (!session?.user || session.user.id !== ALLOWED_ADMIN_ID) {
			return NextResponse.redirect(buildRedirectUrl("/write/login", request));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/write/:path*", "/api/auth/:path*"],
};
