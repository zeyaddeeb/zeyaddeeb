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
		<div className="min-h-screen bg-neutral-950">
			<section className="relative overflow-hidden border-b border-neutral-800/50 px-4 py-12 md:px-6 md:py-16">
				<div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-linear-to-br from-white/5 to-transparent blur-3xl" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-linear-to-tl from-white/5 to-transparent blur-3xl" />

				<div className="relative mx-auto max-w-7xl">
					<p className="mb-3 text-sm font-medium uppercase tracking-widest text-neutral-500">
						Blog & Collection
					</p>
					<h1
						className="mb-4 bg-linear-to-r from-white via-white to-neutral-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl lg:text-6xl"
						style={{ fontFamily: "var(--font-space-grotesk)" }}
					>
						Welcome to my corner
						<br />
						<span className="text-neutral-500">of the internet.</span>
					</h1>
					<p className="max-w-xl text-base text-neutral-400 md:text-lg">
						Thoughts, writings, and a curated collection of things that inspire
						me.
					</p>
				</div>
			</section>

			<section className="px-4 py-8 md:px-6 md:py-12">
				<div className="mx-auto max-w-7xl">
					<div className="grid gap-8 lg:grid-cols-5 lg:gap-12">
						<div className="lg:col-span-3">
							<div className="mb-6 flex items-center justify-between">
								<h2
									className="text-xl font-bold text-white md:text-2xl"
									style={{ fontFamily: "var(--font-space-grotesk)" }}
								>
									Recent Posts
								</h2>
								<Link
									href="/posts"
									className="text-sm text-neutral-400 transition-colors hover:text-white"
								>
									View all →
								</Link>
							</div>

							{recentPosts.length > 0 ? (
								<div className="space-y-4">
									{recentPosts.map((post) => (
										<Link
											key={post.id}
											href={`/posts/${post.slug}`}
											className="group flex gap-4 overflow-hidden rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-4 transition-all hover:border-neutral-700 hover:bg-neutral-900"
										>
											{post.coverImage && (
												<div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg">
													<img
														src={post.coverImage}
														alt={post.title}
														className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
													/>
												</div>
											)}
											<div className="flex flex-1 flex-col justify-center">
												<h3 className="mb-1 text-base font-semibold text-white group-hover:text-neutral-200">
													{post.title}
												</h3>
												{post.excerpt && (
													<p className="mb-2 line-clamp-2 text-sm text-neutral-400">
														{post.excerpt}
													</p>
												)}
												{post.publishedAt && (
													<time className="text-xs text-neutral-500">
														{new Date(post.publishedAt).toLocaleDateString(
															"en-US",
															{
																year: "numeric",
																month: "short",
																day: "numeric",
															},
														)}
													</time>
												)}
											</div>
										</Link>
									))}
								</div>
							) : (
								<p className="text-neutral-500">No posts yet.</p>
							)}
						</div>

						<div className="lg:col-span-2">
							<div className="mb-6 flex items-center justify-between">
								<h2
									className="text-xl font-bold text-white md:text-2xl"
									style={{ fontFamily: "var(--font-space-grotesk)" }}
								>
									Things I Like
								</h2>
								<Link
									href="/things-i-like"
									className="text-sm text-neutral-400 transition-colors hover:text-white"
								>
									View all →
								</Link>
							</div>

							{featuredItems.length > 0 ? (
								<CollectionGrid
									items={featuredItems}
									filterKey="featured"
									columns={2}
								/>
							) : (
								<p className="text-neutral-500">No items yet.</p>
							)}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
