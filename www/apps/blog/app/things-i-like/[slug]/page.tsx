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
			title: "Not Found",
		};
	}

	const ogImage = item.imageUrl || "/og-image.png";

	return {
		title: `${item.title} | Things I Like`,
		description: item.description || `${item.title} - A thing I like`,
		openGraph: {
			type: "article",
			title: item.title,
			description: item.description || `${item.title} - A thing I like`,
			url: `https://www.zeyaddeeb.com/blog/things-i-like/${slug}`,
			siteName: "Zeyad Deeb - Things I Like",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: item.title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: item.title,
			description: item.description || `${item.title} - A thing I like`,
			images: [ogImage],
			creator: "@zeyad_deeb",
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
