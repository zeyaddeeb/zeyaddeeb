import { redirect } from "next/navigation";
import { AccessDenied } from "@/features/write/write-notice";
import { requireAdminPage } from "@/lib/session";

export default async function WritePage() {
	const user = await requireAdminPage();
	if (!user) return <AccessDenied />;
	redirect("/write/dashboard");
}
