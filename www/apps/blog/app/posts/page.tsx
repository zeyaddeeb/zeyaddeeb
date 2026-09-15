import { listingMetadata, pageNumber } from "@zeyaddeeb/ui/seo";
import { getPosts } from "@/lib/actions";
import { BlogContent } from "./blog-content";

interface PageProps {
	searchParams: Promise<{
		page?: string;
		search?: string;
	}>;
}

export async function generateMetadata({ searchParams }: PageProps) {
	const params = await searchParams;
	return listingMetadata({
		title: "Blog",
		description:
			"Notes by Zeyad Deeb on software engineering, machine learning, Rust, and the ideas behind his projects.",
		path: "/blog/posts",
		section: "Blog",
		filters: { search: params.search },
		page: params.page,
	});
}

export default async function BlogPage({ searchParams }: PageProps) {
	const params = await searchParams;
	const page = pageNumber(params.page);
	const search = params.search || "";

	const result = await getPosts({
		page,
		pageSize: 10,
		search: search || undefined,
	});

	return (
		<BlogContent
			initialData={result}
			currentPage={page}
			currentSearch={search}
		/>
	);
}
