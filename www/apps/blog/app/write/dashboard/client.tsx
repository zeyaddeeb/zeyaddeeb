"use client";

import Link from "next/link";
import { useState } from "react";
import { getTypeLabel } from "@/components/collection-type-icon";
import { PageHeader, type WriterUser } from "@/features/write/form-layout";
import type { AdminCollectionRow, AdminPostRow } from "@/lib/actions/write";
import { formatLocaleDate } from "@/lib/format-date";

interface DashboardClientProps {
	user: WriterUser;
	posts: AdminPostRow[];
	collections: AdminCollectionRow[];
}

type Tab = "posts" | "collections";

export function DashboardClient({
	user,
	posts,
	collections,
}: DashboardClientProps) {
	const [activeTab, setActiveTab] = useState<Tab>("posts");

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-5xl mx-auto">
				<PageHeader title="Dashboard" user={user} />

				<div className="flex gap-4 mb-8">
					<Link
						href="/write/post"
						className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors"
					>
						New Post
					</Link>
					<Link
						href="/write/collection"
						className="px-4 py-2 border border-neutral-700 rounded-lg hover:bg-neutral-900 transition-colors"
					>
						New Collection Item
					</Link>
				</div>

				<div className="flex gap-1 mb-6 border-b border-neutral-800">
					<button
						type="button"
						onClick={() => setActiveTab("posts")}
						className={`px-4 py-2 text-sm font-medium transition-colors relative ${
							activeTab === "posts"
								? "text-white"
								: "text-neutral-400 hover:text-white"
						}`}
					>
						Posts ({posts.length})
						{activeTab === "posts" && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
						)}
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("collections")}
						className={`px-4 py-2 text-sm font-medium transition-colors relative ${
							activeTab === "collections"
								? "text-white"
								: "text-neutral-400 hover:text-white"
						}`}
					>
						Library ({collections.length})
						{activeTab === "collections" && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
						)}
					</button>
				</div>

				{activeTab === "posts" && (
					<div className="space-y-4">
						{posts.length === 0 ? (
							<p className="text-neutral-400">
								No posts yet. Create your first post!
							</p>
						) : (
							<div className="border border-neutral-800 rounded-lg overflow-hidden">
								<table className="w-full">
									<thead className="bg-neutral-900">
										<tr>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Title
											</th>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Status
											</th>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Updated
											</th>
											<th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">
												Actions
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-800">
										{posts.map((post) => (
											<tr key={post.id} className="hover:bg-neutral-900/50">
												<td className="px-4 py-3">
													<span className="font-medium">{post.title}</span>
													<p className="text-sm text-neutral-500">
														{post.slug}
													</p>
												</td>
												<td className="px-4 py-3">
													<span
														className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
															post.published
																? "bg-green-500/10 text-green-400"
																: "bg-yellow-500/10 text-yellow-400"
														}`}
													>
														{post.published ? "Published" : "Draft"}
													</span>
												</td>
												<td className="px-4 py-3 text-sm text-neutral-400">
													{formatLocaleDate(post.updatedAt)}
												</td>
												<td className="px-4 py-3 text-right">
													<div className="flex justify-end gap-2">
														<Link
															href={`/posts/${post.slug}`}
															className="text-sm text-neutral-400 hover:text-white transition-colors"
														>
															View
														</Link>
														<Link
															href={`/write/post/edit/${post.id}`}
															className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
														>
															Edit
														</Link>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				)}

				{activeTab === "collections" && (
					<div className="space-y-4">
						{collections.length === 0 ? (
							<p className="text-neutral-400">
								No collection items yet. Add something you like!
							</p>
						) : (
							<div className="border border-neutral-800 rounded-lg overflow-hidden">
								<table className="w-full">
									<thead className="bg-neutral-900">
										<tr>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Title
											</th>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Type
											</th>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Status
											</th>
											<th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">
												Updated
											</th>
											<th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">
												Actions
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-800">
										{collections.map((item) => (
											<tr key={item.id} className="hover:bg-neutral-900/50">
												<td className="px-4 py-3">
													<span className="font-medium">{item.title}</span>
													<p className="text-sm text-neutral-500">
														{item.slug}
													</p>
												</td>
												<td className="px-4 py-3">
													<span className="text-sm text-neutral-400">
														{getTypeLabel(item.type)}
													</span>
												</td>
												<td className="px-4 py-3">
													<div className="flex gap-1">
														<span
															className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
																item.published
																	? "bg-green-500/10 text-green-400"
																	: "bg-yellow-500/10 text-yellow-400"
															}`}
														>
															{item.published ? "Published" : "Draft"}
														</span>
														{item.featured && (
															<span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400">
																Featured
															</span>
														)}
													</div>
												</td>
												<td className="px-4 py-3 text-sm text-neutral-400">
													{formatLocaleDate(item.updatedAt)}
												</td>
												<td className="px-4 py-3 text-right">
													<div className="flex justify-end gap-2">
														<Link
															href={`/library/${item.slug}`}
															className="text-sm text-neutral-400 hover:text-white transition-colors"
														>
															View
														</Link>
														<Link
															href={`/write/collection/edit/${item.id}`}
															className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
														>
															Edit
														</Link>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				)}
			</div>
		</main>
	);
}
