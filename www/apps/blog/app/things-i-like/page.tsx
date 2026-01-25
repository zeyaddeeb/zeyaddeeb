import type { CollectionItemType } from "@zeyaddeeb/db/schema";
import type { Metadata } from "next";
import { getAllCollectionTypes, getCollectionItems } from "@/lib/actions";
import { ThingsILikeContent } from "./things-i-like-content";

export const metadata: Metadata = {
	title: "Things I Like | Zeyad Deeb",
	description:
		"A curated collection of things I find interesting - books, art, videos, products, and more.",
};

interface PageProps {
	searchParams: Promise<{
		page?: string;
		type?: string;
		q?: string;
	}>;
}

export default async function ThingsILikePage({ searchParams }: PageProps) {
	const params = await searchParams;
	const page = Number(params.page) || 1;
	const type = (params.type as CollectionItemType) || null;
	const search = params.q || "";

	const [result, allTypes] = await Promise.all([
		getCollectionItems({
			page,
			pageSize: 12,
			type,
			search,
		}),
		getAllCollectionTypes(),
	]);

	return (
		<ThingsILikeContent
			initialData={result}
			allTypes={allTypes}
			currentPage={page}
			currentType={type}
			currentSearch={search}
		/>
	);
}
