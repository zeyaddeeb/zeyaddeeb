import type { Metadata } from "next";
import { getPosts } from "@/lib/actions";
import { BlogContent } from "./blog-content";

export const metadata: Metadata = {
	title: "Blog | Zeyad Deeb",
	description: "Thoughts on software development, technology, and life.",
};

interface PageProps {
	searchParams: Promise<{
		page?: string;
		search?: string;
	}>;
}

export default async function BlogPage({ searchParams }: PageProps) {
	const params = await searchParams;
	const page = Number(params.page) || 1;
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
