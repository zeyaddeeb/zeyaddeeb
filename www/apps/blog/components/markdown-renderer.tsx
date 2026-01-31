"use client";

import katex from "katex";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import "./markdown-editor.css";

function processLatex(content: string): string {
	let processed = content
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

	processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
		try {
			return `<div class="katex-block">${katex.renderToString(latex.trim(), {
				displayMode: true,
				throwOnError: false,
			})}</div>`;
		} catch {
			return `<div class="katex-error">$$${latex}$$</div>`;
		}
	});

	processed = processed.replace(/\$([^$]+?)\$/g, (_, latex) => {
		if (/^\d+(\.\d{2})?$/.test(latex.trim())) {
			return `$${latex}$`;
		}
		try {
			return katex.renderToString(latex.trim(), {
				displayMode: false,
				throwOnError: false,
			});
		} catch {
			return `<span class="katex-error">$${latex}$</span>`;
		}
	});

	return processed;
}

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

export function MarkdownRenderer({
	content,
	className,
}: MarkdownRendererProps) {
	const processedContent = processLatex(content);

	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, rehypeHighlight]}
				components={{
					h1: ({ children, node }) => {
						const styleAttr = node?.properties?.style as string | undefined;
						const textAlign = styleAttr?.match(/text-align:\s*(\w+)/)?.[1];
						return (
							<h1
								className="mb-4 mt-8 text-3xl font-bold tracking-tight text-white first:mt-0"
								style={
									textAlign
										? {
												textAlign: textAlign as
													| "left"
													| "center"
													| "right"
													| "justify",
											}
										: undefined
								}
							>
								{children}
							</h1>
						);
					},
					h2: ({ children, node }) => {
						const styleAttr = node?.properties?.style as string | undefined;
						const textAlign = styleAttr?.match(/text-align:\s*(\w+)/)?.[1];
						return (
							<h2
								className="mb-3 mt-8 text-2xl font-semibold tracking-tight text-white first:mt-0"
								style={
									textAlign
										? {
												textAlign: textAlign as
													| "left"
													| "center"
													| "right"
													| "justify",
											}
										: undefined
								}
							>
								{children}
							</h2>
						);
					},
					h3: ({ children, node }) => {
						const styleAttr = node?.properties?.style as string | undefined;
						const textAlign = styleAttr?.match(/text-align:\s*(\w+)/)?.[1];
						return (
							<h3
								className="mb-2 mt-6 text-xl font-semibold tracking-tight text-white first:mt-0"
								style={
									textAlign
										? {
												textAlign: textAlign as
													| "left"
													| "center"
													| "right"
													| "justify",
											}
										: undefined
								}
							>
								{children}
							</h3>
						);
					},
					h4: ({ children, node }) => {
						const styleAttr = node?.properties?.style as string | undefined;
						const textAlign = styleAttr?.match(/text-align:\s*(\w+)/)?.[1];
						return (
							<h4
								className="mb-2 mt-4 text-lg font-semibold text-white first:mt-0"
								style={
									textAlign
										? {
												textAlign: textAlign as
													| "left"
													| "center"
													| "right"
													| "justify",
											}
										: undefined
								}
							>
								{children}
							</h4>
						);
					},
					p: ({ children, node }) => {
						const styleAttr = node?.properties?.style as string | undefined;
						const textAlign = styleAttr?.match(/text-align:\s*(\w+)/)?.[1];
						return (
							<p
								className="mb-4 leading-relaxed text-neutral-300"
								style={
									textAlign
										? {
												textAlign: textAlign as
													| "left"
													| "center"
													| "right"
													| "justify",
											}
										: undefined
								}
							>
								{children}
							</p>
						);
					},
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
					img: function MarkdownImage({ src, alt, width, height, ...props }) {
						const restProps = props as {
							style?: string;
							"data-align"?: string;
						};
						const style = restProps.style;
						const align = restProps["data-align"] || "left";
						const styleObj: React.CSSProperties = {};

						if (width) {
							styleObj.width = typeof width === "number" ? `${width}px` : width;
						} else if (style) {
							const widthMatch = style.match(/width:\s*([^;]+)/);
							if (widthMatch) {
								styleObj.width = widthMatch[1].trim();
							}
						}

						if (height) {
							styleObj.height =
								typeof height === "number" ? `${height}px` : height;
						} else if (style) {
							const heightMatch = style.match(/height:\s*([^;]+)/);
							if (heightMatch) {
								styleObj.height = heightMatch[1].trim();
							}
						}

						if (!src) return null;

						const alignClass =
							align === "center"
								? "flex justify-center"
								: align === "right"
									? "flex justify-end"
									: "";

						const imgElement = (
							// biome-ignore lint: dynamic markdown content requires native img element
							<img
								src={src}
								alt={alt || ""}
								className="my-4 rounded-lg max-w-full"
								style={styleObj}
								loading="lazy"
							/>
						);

						if (alignClass) {
							return <div className={alignClass}>{imgElement}</div>;
						}

						return imgElement;
					},
				}}
			>
				{processedContent}
			</ReactMarkdown>
		</div>
	);
}
