import { CollectionEditor } from "@/features/write/collection-editor";
import { AccessDenied, WriteNotice } from "@/features/write/write-notice";
import { getCollectionItemForEdit } from "@/lib/actions/write";
import { requireAdminPage } from "@/lib/session";

interface EditCollectionPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditCollectionPage({
	params,
}: EditCollectionPageProps) {
	const { id } = await params;
	const user = await requireAdminPage();

	if (!user) return <AccessDenied />;

	const result = await getCollectionItemForEdit(id);

	if (!result.success) {
		return <WriteNotice title="Item Not Found" message={result.error} />;
	}

	return <CollectionEditor user={user} item={result.data} />;
}
