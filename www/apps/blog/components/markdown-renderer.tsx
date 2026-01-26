"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

export function MarkdownRenderer({
	content,
	className,
}: MarkdownRendererProps) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, rehypeHighlight]}
				components={{
					h1: ({ children }) => (
						<h1 className="mb-4 mt-8 text-3xl font-bold tracking-tight text-white first:mt-0">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="mb-3 mt-8 text-2xl font-semibold tracking-tight text-white first:mt-0">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="mb-2 mt-6 text-xl font-semibold tracking-tight text-white first:mt-0">
							{children}
						</h3>
					),
					h4: ({ children }) => (
						<h4 className="mb-2 mt-4 text-lg font-semibold text-white first:mt-0">
							{children}
						</h4>
					),
					p: ({ children }) => (
						<p className="mb-4 leading-relaxed text-neutral-300">{children}</p>
					),
					a: ({ href, children }) => (
						<a
							href={href}
							className="text-blue-400 underline-offset-2 hover:underline"
							target={href?.startsWith("http") ? "_blank" : undefined}
							rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
						>
							{children}
						</a>
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-white">{children}</strong>
					),
					em: ({ children }) => <em className="italic">{children}</em>,
					code: ({ className, children, ...props }) => {
						const isInline = !className;
						if (isInline) {
							return (
								<code className="rounded-md bg-neutral-800/80 px-1.5 py-0.5 text-[13px] font-mono text-amber-400">
									{children}
								</code>
							);
						}
						return (
							<code className={`${className} block`} {...props}>
								{children}
							</code>
						);
					},
					pre: ({ children }) => (
						<pre className="my-4 overflow-x-auto rounded-lg border border-neutral-700/50 bg-[#0d1117] px-4 py-3 text-[13px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
							{children}
						</pre>
					),
					ul: ({ children }) => (
						<ul className="mb-4 ml-6 list-disc space-y-2 text-neutral-300">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="mb-4 ml-6 list-decimal space-y-2 text-neutral-300">
							{children}
						</ol>
					),
					li: ({ children }) => <li className="leading-relaxed">{children}</li>,
					blockquote: ({ children }) => (
						<blockquote className="my-4 border-l-4 border-neutral-700 pl-4 italic text-neutral-400">
							{children}
						</blockquote>
					),
					hr: () => <hr className="my-8 border-neutral-800" />,
					table: ({ children }) => (
						<div className="my-4 overflow-x-auto">
							<table className="min-w-full border-collapse border border-neutral-800">
								{children}
							</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="bg-neutral-900">{children}</thead>
					),
					th: ({ children }) => (
						<th className="border border-neutral-800 px-4 py-2 text-left font-semibold text-white">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="border border-neutral-800 px-4 py-2 text-neutral-300">
							{children}
						</td>
					),
					img: ({ src, alt }) => (
						<img
							src={src}
							alt={alt || ""}
							className="my-4 rounded-lg"
							loading="lazy"
						/>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
