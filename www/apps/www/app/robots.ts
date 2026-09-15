import { siteUrl } from "@zeyaddeeb/ui/seo";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/blog/api/"] }],
		sitemap: [siteUrl("/sitemap.xml"), siteUrl("/blog/sitemap.xml")],
	};
}
