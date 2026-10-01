import { CollectionEditor } from "@/features/write/collection-editor";
import { AccessDenied } from "@/features/write/write-notice";
import { requireAdminPage } from "@/lib/session";

export default async function CollectionWritePage() {
	const user = await requireAdminPage();

	if (!user) return <AccessDenied />;

	return <CollectionEditor user={user} />;
}
