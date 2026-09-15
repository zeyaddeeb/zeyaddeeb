import { serializeJsonLd } from "../seo";

export function JsonLd({ data }: { data: unknown }) {
	return (
		<script
			type="application/ld+json"
			// JSON is escaped to prevent user content from closing the script tag.
			// biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes HTML delimiters.
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
		/>
	);
}
