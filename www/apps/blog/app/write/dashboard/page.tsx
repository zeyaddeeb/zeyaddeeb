import {
	getAllCollectionItemsForAdmin,
	getAllPostsForAdmin,
	getSession,
} from "@/lib/actions/write";
import { redirect } from "@/lib/redirect-utils";
import { DashboardClient } from "./client";

const ALLOWED_ADMIN_ID = process.env.ADMIN_ID || "admin";

export default async function DashboardPage() {
	const session = await getSession();

	if (!session?.user) {
		redirect("/write/login");
	}

	if (session.user.id !== ALLOWED_ADMIN_ID) {
		return (
			<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
				<div className="max-w-2xl mx-auto text-center">
					<h1 className="text-3xl font-bold text-red-500">Access Denied</h1>
					<p className="mt-4 text-neutral-400">
						You don't have permission to access this page.
					</p>
				</div>
			</main>
		);
	}

	const [postsResult, collectionsResult] = await Promise.all([
		getAllPostsForAdmin(),
		getAllCollectionItemsForAdmin(),
	]);

	const posts = postsResult.success ? postsResult.data : [];
	const collections = collectionsResult.success ? collectionsResult.data : [];

	return (
		<DashboardClient
			user={session.user}
			posts={posts}
			collections={collections}
		/>
	);
}
