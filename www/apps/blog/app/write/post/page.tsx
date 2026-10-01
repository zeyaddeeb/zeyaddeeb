import { PostEditor } from "@/features/write/post-editor";
import { AccessDenied } from "@/features/write/write-notice";
import { requireAdminPage } from "@/lib/session";

export default async function NewPostPage() {
	const user = await requireAdminPage();

	if (!user) return <AccessDenied />;

	return <PostEditor user={user} />;
}
