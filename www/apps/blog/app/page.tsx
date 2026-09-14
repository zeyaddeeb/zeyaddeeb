import Image from "next/image";
import Link from "next/link";
import { CollectionGrid } from "@/components";
import { getFeaturedCollectionItems, getRecentPosts } from "@/lib/actions";

export const dynamic = "force-dynamic";
export default async function HomePage() {
	const [featuredResult, postsResult] = await Promise.allSettled([
		getFeaturedCollectionItems(4),
		getRecentPosts(3),
	]);
	const featuredItems =
		featuredResult.status === "fulfilled" ? featuredResult.value : [];
	const recentPosts =
		postsResult.status === "fulfilled" ? postsResult.value : [];
	return (
		<div className="blog-home container">
			<header className="blog-masthead">
				<div>
					<p className="blog-kicker">Writing & bookmarks</p>
					<h1>
						Blog &<br />
						library<span>.</span>
					</h1>
				</div>
				<div className="blog-motif" aria-hidden="true">
					<i />
					<i />
					<i />
				</div>
			</header>
			<div className="blog-home__columns">
				<section>
					<div className="blog-section-heading">
						<h2>Latest writing</h2>
						<Link href="/posts">All posts →</Link>
					</div>
					{recentPosts.length ? (
						recentPosts.map((post) => (
							<Link
								key={post.id}
								href={`/posts/${post.slug}`}
								className="post-entry"
							>
								<div>
									{post.publishedAt && (
										<time dateTime={new Date(post.publishedAt).toISOString()}>
											{new Date(post.publishedAt).toLocaleDateString("en-US", {
												year: "numeric",
												month: "short",
												day: "numeric",
											})}
										</time>
									)}
									<h3>{post.title}</h3>
									{post.excerpt && <p>{post.excerpt}</p>}
								</div>
								{post.coverImage && (
									<div className="post-entry__image">
										<Image
											src={post.coverImage}
											alt=""
											fill
											sizes="180px"
											className="object-cover"
										/>
									</div>
								)}
							</Link>
						))
					) : (
						<p className="blog-empty">
							{postsResult.status === "rejected"
								? "Posts couldn’t load. Please try again shortly."
								: "No posts yet."}
						</p>
					)}
				</section>
				<section>
					<div className="blog-section-heading">
						<h2>From the library</h2>
						<Link href="/library">All items →</Link>
					</div>
					{featuredItems.length ? (
						<CollectionGrid
							items={featuredItems}
							filterKey="featured"
							columns={2}
						/>
					) : (
						<p className="blog-empty">
							{featuredResult.status === "rejected"
								? "The library couldn’t load. Please try again shortly."
								: "No items yet."}
						</p>
					)}
				</section>
			</div>
		</div>
	);
}
