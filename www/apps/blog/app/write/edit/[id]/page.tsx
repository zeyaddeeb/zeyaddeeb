import { redirect } from "next/navigation";
import { getPostForEdit, getSession } from "@/lib/actions/write";
import { EditClient } from "./client";

const ALLOWED_ADMIN_ID = process.env.ADMIN_ID || "admin";

interface EditPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditPage({ params }: EditPageProps) {
	const { id } = await params;
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

	const postResult = await getPostForEdit(id);

	if (!postResult.success) {
		return (
			<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
				<div className="max-w-2xl mx-auto text-center">
					<h1 className="text-3xl font-bold text-red-500">Post Not Found</h1>
					<p className="mt-4 text-neutral-400">{postResult.error}</p>
				</div>
			</main>
		);
	}

	return <EditClient user={session.user} post={postResult.data} />;
}
