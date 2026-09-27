import { PostEditor } from "@/features/write/post-editor";
import { AccessDenied, WriteNotice } from "@/features/write/write-notice";
import { getPostForEdit } from "@/lib/actions/write";
import { requireAdminPage } from "@/lib/session";

interface EditPostPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: EditPostPageProps) {
	const { id } = await params;
	const user = await requireAdminPage();
	if (!user) return <AccessDenied />;

	const result = await getPostForEdit(id);
	if (!result.success) {
		return <WriteNotice title="Post Not Found" message={result.error} />;
	}

	return <PostEditor user={user} post={result.data} />;
}
