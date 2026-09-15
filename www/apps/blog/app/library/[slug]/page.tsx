import { pageMetadata } from "@zeyaddeeb/ui/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCollectionItemBySlug } from "@/lib/actions";
import { CollectionItemDetail } from "./collection-item-detail";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

const getItem = cache(getCollectionItemBySlug);

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const item = await getItem(slug);
	if (!item) notFound();
	return pageMetadata({
		title: item.title,
		path: `/blog/library/${encodeURIComponent(item.slug)}`,
		section: "Library",
		description:
			item.description ||
			`${item.title}, saved in Zeyad Deeb’s library of books, art, podcasts, and links.`,
		image: item.imageUrl,
	});
}

export default async function CollectionItemPage({ params }: PageProps) {
	const { slug } = await params;
	const item = await getItem(slug);

	if (!item) {
		notFound();
	}

	return <CollectionItemDetail item={item} />;
}
