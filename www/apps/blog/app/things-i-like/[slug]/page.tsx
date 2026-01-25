import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollectionItemBySlug } from "@/lib/actions";
import { CollectionItemDetail } from "./collection-item-detail";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const item = await getCollectionItemBySlug(slug);

	if (!item) {
		return {
			title: "Not Found | Zeyad Deeb",
		};
	}

	return {
		title: `${item.title} | Things I Like`,
		description: item.description || `${item.title} - A thing I like`,
		openGraph: {
			title: item.title,
			description: item.description || undefined,
			images: item.imageUrl ? [item.imageUrl] : undefined,
		},
	};
}

export default async function CollectionItemPage({ params }: PageProps) {
	const { slug } = await params;
	const item = await getCollectionItemBySlug(slug);

	if (!item) {
		notFound();
	}

	return <CollectionItemDetail item={item} />;
}
