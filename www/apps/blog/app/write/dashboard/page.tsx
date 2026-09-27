import { AccessDenied } from "@/features/write/write-notice";
import {
	getAllCollectionItemsForAdmin,
	getAllPostsForAdmin,
} from "@/lib/actions/write";
import { requireAdminPage } from "@/lib/session";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
	const user = await requireAdminPage();
	if (!user) return <AccessDenied />;

	const [postsResult, collectionsResult] = await Promise.all([
		getAllPostsForAdmin(),
		getAllCollectionItemsForAdmin(),
	]);

	return (
		<DashboardClient
			user={user}
			posts={postsResult.success ? postsResult.data : []}
			collections={collectionsResult.success ? collectionsResult.data : []}
		/>
	);
}
