import type { CollectionItemType } from "@zeyaddeeb/db/schema";
import { listingMetadata, pageNumber } from "@zeyaddeeb/ui/seo";
import { getAllCollectionTypes, getCollectionItems } from "@/lib/actions";
import { ThingsILikeContent } from "./library-content";

interface PageProps {
	searchParams: Promise<{
		page?: string;
		type?: string;
		q?: string;
	}>;
}

export async function generateMetadata({ searchParams }: PageProps) {
	const params = await searchParams;
	return listingMetadata({
		title: "Library",
		description:
			"Books, art, podcasts, videos, and links saved by Zeyad Deeb, with notes on what makes each worth exploring.",
		path: "/blog/library",
		section: "Library",
		filters: { type: params.type, q: params.q },
		page: params.page,
	});
}

export default async function ThingsILikePage({ searchParams }: PageProps) {
	const params = await searchParams;
	const page = pageNumber(params.page);
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
