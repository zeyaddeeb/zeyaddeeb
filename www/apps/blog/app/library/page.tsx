import { COLLECTION_ITEM_TYPES } from "@zeyaddeeb/db/collection-options";
import { listingMetadata, pageNumber } from "@zeyaddeeb/ui/seo";
import { getAllCollectionTypes, getCollectionItems } from "@/lib/actions";
import { COLLECTION_PAGE_SIZE } from "@/lib/pagination";
import { LibraryContent } from "./library-content";

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

export default async function LibraryPage({ searchParams }: PageProps) {
	const params = await searchParams;
	const page = pageNumber(params.page);
	const type = COLLECTION_ITEM_TYPES.find((t) => t === params.type) ?? null;
	const search = params.q || "";

	const [result, allTypes] = await Promise.all([
		getCollectionItems({
			page,
			pageSize: COLLECTION_PAGE_SIZE,
			type,
			search,
		}),
		getAllCollectionTypes(),
	]);

	return (
		<LibraryContent
			initialData={result}
			allTypes={allTypes}
			currentPage={page}
			currentType={type}
			currentSearch={search}
		/>
	);
}
