"use client";

import { definer as terraformDefiner } from "@taga3s/highlightjs-terraform";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
	type Editor,
	EditorContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
	useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import "highlight.js/styles/github-dark.css";
import { all, createLowlight } from "lowlight";
import {
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import "./markdown-editor.css";

const lowlight = createLowlight(all);
lowlight.register("terraform", terraformDefiner);
lowlight.register("hcl", terraformDefiner);
lowlight.register("tf", terraformDefiner);

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function isLikelyMarkdown(text: string): boolean {
	return /```|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*/m.test(
		text,
	);
}

function formatInlineMarkdown(text: string): string {
	let formatted = escapeHtml(text);
	const codeTokens: string[] = [];

	formatted = formatted.replace(/`([^`]+)`/g, (_, code) => {
		const token = `__INLINE_CODE_${codeTokens.length}__`;
		codeTokens.push(`<code>${code}</code>`);
		return token;
	});

	formatted = formatted.replace(
		/\[([^\]]+)\]\(([^\s)]+(?:\s+"[^"]+")?)\)/g,
		(_, label, href) => `<a href="${href}">${label}</a>`,
	);
	formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	formatted = formatted.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	formatted = formatted.replace(/~~([^~]+)~~/g, "<del>$1</del>");
	formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	formatted = formatted.replace(/_([^_]+)_/g, "<em>$1</em>");

	for (let i = 0; i < codeTokens.length; i++) {
		formatted = formatted.replace(`__INLINE_CODE_${i}__`, codeTokens[i]);
	}

	return formatted;
}

function convertMarkdownChunkToHtml(chunk: string): string {
	const lines = chunk.split("\n");
	const blocks: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim()) {
			i++;
			continue;
		}

		const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			blocks.push(`<h${level}>${formatInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
			i++;
			continue;
		}

		if (/^\s{0,3}(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line)) {
			blocks.push("<hr />");
			i++;
			continue;
		}

		if (/^\s{0,3}>\s?/.test(line)) {
			const quoteLines: string[] = [];
			while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
				quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
				i++;
			}
			blocks.push(`<blockquote><p>${formatInlineMarkdown(quoteLines.join("\n")).replace(/\n/g, "<br />")}</p></blockquote>`);
			continue;
		}

		const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
		const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
		if (unorderedMatch || orderedMatch) {
			const isOrdered = Boolean(orderedMatch);
			const listTag = isOrdered ? "ol" : "ul";
			const listPattern = isOrdered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
			const items: string[] = [];

			while (i < lines.length) {
				const itemMatch = lines[i].match(listPattern);
				if (!itemMatch) break;
				items.push(`<li>${formatInlineMarkdown(itemMatch[1].trim())}</li>`);
				i++;
			}

			blocks.push(`<${listTag}>${items.join("")}</${listTag}>`);
			continue;
		}

		const paragraphLines: string[] = [];
		while (i < lines.length && lines[i].trim()) {
			if (/^\s{0,3}(#{1,6})\s+/.test(lines[i])) break;
			if (/^\s{0,3}>\s?/.test(lines[i])) break;
			if (/^\s*[-*+]\s+/.test(lines[i])) break;
			if (/^\s*\d+\.\s+/.test(lines[i])) break;
			if (/^\s{0,3}(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(lines[i])) break;
			paragraphLines.push(lines[i]);
			i++;
		}

		if (paragraphLines.length > 0) {
			blocks.push(
				`<p>${formatInlineMarkdown(paragraphLines.join("\n")).replace(/\n/g, "<br />")}</p>`,
			);
		}
	}

	return blocks.join("\n");
}

function convertMarkdownPasteToHtml(markdown: string): string {
	const normalized = markdown.replace(/\r\n/g, "\n");
	const blocks: string[] = [];
	let cursor = 0;
	const fencePattern = /```([\w-]+)?\n([\s\S]*?)```/g;

	const pushTextBlock = (chunk: string) => {
		const trimmed = chunk.trim();
		if (!trimmed) return;
		blocks.push(convertMarkdownChunkToHtml(trimmed));
	};

	for (const match of normalized.matchAll(fencePattern)) {
		const start = match.index ?? 0;
		const before = normalized.slice(cursor, start);
		pushTextBlock(before);

		const language = (match[1] || "").trim().toLowerCase();
		const code = match[2] || "";
		const className = language ? ` class=\"language-${language}\"` : "";
		blocks.push(`<pre><code${className}>${escapeHtml(code)}</code></pre>`);
		cursor = start + match[0].length;
	}

	pushTextBlock(normalized.slice(cursor));
	return blocks.join("\n");
}

function ResizableImageNodeView({
	node,
	updateAttributes,
	selected,
}: NodeViewProps) {
	const [isResizing, setIsResizing] = useState(false);
	const imageRef = useRef<HTMLImageElement>(null);
	const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, corner: string) => {
			e.preventDefault();
			e.stopPropagation();
			setIsResizing(true);

			const img = imageRef.current;
			if (!img) return;

			startPos.current = {
				x: e.clientX,
				y: e.clientY,
				width: img.offsetWidth,
				height: img.offsetHeight,
			};

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const deltaX = moveEvent.clientX - startPos.current.x;
				const deltaY = moveEvent.clientY - startPos.current.y;

				let newWidth = startPos.current.width;
				let newHeight = startPos.current.height;

				const aspectRatio = startPos.current.width / startPos.current.height;

				if (corner.includes("e")) {
					newWidth = Math.max(50, startPos.current.width + deltaX);
					newHeight = newWidth / aspectRatio;
				} else if (corner.includes("w")) {
					newWidth = Math.max(50, startPos.current.width - deltaX);
					newHeight = newWidth / aspectRatio;
				}

				if (
					corner.includes("s") &&
					!corner.includes("e") &&
					!corner.includes("w")
				) {
					newHeight = Math.max(50, startPos.current.height + deltaY);
					newWidth = newHeight * aspectRatio;
				} else if (
					corner.includes("n") &&
					!corner.includes("e") &&
					!corner.includes("w")
				) {
					newHeight = Math.max(50, startPos.current.height - deltaY);
					newWidth = newHeight * aspectRatio;
				}

				updateAttributes({
					width: Math.round(newWidth),
					height: Math.round(newHeight),
				});
			};

			const handleMouseUp = () => {
				setIsResizing(false);
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[updateAttributes],
	);

	const attrs = node.attrs as {
		src?: string;
		alt?: string;
		title?: string;
		width?: number | string;
		height?: number | string;
		align?: "left" | "center" | "right";
	};

	const width = attrs.width;
	const height = attrs.height;
	const src = attrs.src;
	const align = attrs.align || "left";

	if (!src || src === "") {
		return (
			<NodeViewWrapper className="resizable-image-wrapper">
				<div className="rounded-lg border border-dashed border-neutral-600 bg-neutral-800 p-4 text-center text-neutral-400">
					Loading image...
				</div>
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper
			className="resizable-image-wrapper"
			style={{
				display: "flex",
				justifyContent:
					align === "center"
						? "center"
						: align === "right"
							? "flex-end"
							: "flex-start",
			}}
		>
			<div
				className={`resizable-image-container ${
					selected ? "selected" : ""
				} ${isResizing ? "resizing" : ""}`}
				style={{ display: "inline-block", position: "relative" }}
			>
				{/* Alignment toolbar - shown when selected */}
				{selected && (
					<div className="image-align-toolbar">
						<button
							type="button"
							onClick={() => updateAttributes({ align: "left" })}
							className={`image-align-btn ${align === "left" ? "active" : ""}`}
							aria-label="Align left"
							title="Align left"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => updateAttributes({ align: "center" })}
							className={`image-align-btn ${align === "center" ? "active" : ""}`}
							aria-label="Align center"
							title="Align center"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => updateAttributes({ align: "right" })}
							className={`image-align-btn ${align === "right" ? "active" : ""}`}
							aria-label="Align right"
							title="Align right"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z" />
							</svg>
						</button>
					</div>
				)}
				{/* biome-ignore lint: dynamic markdown content requires native img
				element */}
				<img
					ref={imageRef}
					src={src}
					alt={attrs.alt || ""}
					title={attrs.title || ""}
					width={width || undefined}
					height={height || undefined}
					className="rounded-lg max-w-full"
					style={{
						width: width ? `${width}px` : undefined,
						height: height ? `${height}px` : undefined,
						display: "block",
					}}
					draggable={false}
				/>
				{selected && (
					<>
						<button
							type="button"
							className="resize-handle resize-handle-nw"
							onMouseDown={(e) => handleMouseDown(e, "nw")}
							aria-label="Resize from top-left corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-ne"
							onMouseDown={(e) => handleMouseDown(e, "ne")}
							aria-label="Resize from top-right corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-sw"
							onMouseDown={(e) => handleMouseDown(e, "sw")}
							aria-label="Resize from bottom-left corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-se"
							onMouseDown={(e) => handleMouseDown(e, "se")}
							aria-label="Resize from bottom-right corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-n"
							onMouseDown={(e) => handleMouseDown(e, "n")}
							aria-label="Resize from top edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-s"
							onMouseDown={(e) => handleMouseDown(e, "s")}
							aria-label="Resize from bottom edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-e"
							onMouseDown={(e) => handleMouseDown(e, "e")}
							aria-label="Resize from right edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-w"
							onMouseDown={(e) => handleMouseDown(e, "w")}
							aria-label="Resize from left edge"
						/>
					</>
				)}
			</div>
		</NodeViewWrapper>
	);
}

const ResizableImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				renderHTML: (attributes) => {
					if (!attributes.width) return {};
					return { width: attributes.width };
				},
				parseHTML: (element) =>
					element.getAttribute("width") ||
					element.style.width?.replace("px", ""),
			},
			height: {
				default: null,
				renderHTML: (attributes) => {
					if (!attributes.height) return {};
					return { height: attributes.height };
				},
				parseHTML: (element) =>
					element.getAttribute("height") ||
					element.style.height?.replace("px", ""),
			},
			align: {
				default: "left",
				renderHTML: (attributes) => {
					if (!attributes.align || attributes.align === "left") return {};
					return { "data-align": attributes.align };
				},
				parseHTML: (element) => element.getAttribute("data-align") || "left",
			},
		};
	},
	addNodeView() {
		return ReactNodeViewRenderer(ResizableImageNodeView);
	},
});

export interface MarkdownEditorMethods {
	getHTML: () => string;
	setContent: (content: string) => void;
	focus: () => void;
}

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

interface ToolbarProps {
	editor: Editor | null;
}

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!isOpen || !mounted) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				className="absolute inset-0 bg-black/60 cursor-default"
				onClick={onClose}
				aria-label="Close modal"
			/>
			<dialog
				open
				className="relative z-10 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-lg font-medium text-white">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						className="text-neutral-400 hover:text-white"
					>
						✕
					</button>
				</div>
				{children}
			</dialog>
		</div>,
		document.body,
	);
}

interface LinkModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (url: string, text?: string) => void;
	initialUrl?: string;
	initialText?: string;
}

function LinkModal({
	isOpen,
	onClose,
	onSubmit,
	initialUrl = "",
	initialText = "",
}: LinkModalProps) {
	const [url, setUrl] = useState(initialUrl);
	const [text, setText] = useState(initialText);
	const linkUrlId = useId();

	useEffect(() => {
		setUrl(initialUrl);
		setText(initialText);
	}, [initialUrl, initialText]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (url) {
			onSubmit(url, text);
			onClose();
			setUrl("");
			setText("");
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Insert Link">
			<form onSubmit={handleSubmit}>
				<div className="mb-3">
					<label
						htmlFor={linkUrlId}
						className="mb-1 block text-sm text-neutral-400"
					>
						URL
					</label>
					<input
						id={linkUrlId}
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded px-4 py-2 text-sm text-neutral-400 hover:text-white"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!url}
						className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Insert
					</button>
				</div>
			</form>
		</Modal>
	);
}

interface ImageModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (url: string, alt?: string, width?: string) => void;
}

function ImageModal({ isOpen, onClose, onSubmit }: ImageModalProps) {
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");
	const [width, setWidth] = useState("");
	const imageUrlId = useId();
	const imageFileId = useId();
	const imageAltId = useId();
	const imageWidthId = useId();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (url) {
			onSubmit(url, alt, width);
			onClose();
			setUrl("");
			setAlt("");
			setWidth("");
		}
	};

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => {
				const base64 = reader.result as string;
				setUrl(base64);
				if (!alt) {
					setAlt(file.name.replace(/\.[^/.]+$/, ""));
				}
			};
			reader.readAsDataURL(file);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Insert Image">
			<form onSubmit={handleSubmit}>
				<div className="mb-3">
					<label
						htmlFor={imageUrlId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Image URL
					</label>
					<input
						id={imageUrlId}
						type="text"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/image.jpg"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				{url?.startsWith("data:image/") && (
					<div className="mb-3">
						<p className="mb-1 text-sm text-neutral-400">Preview:</p>
						{/* biome-ignore lint: preview image for upload */}
						<img
							src={url}
							alt="Preview"
							className="max-h-32 rounded border border-neutral-700"
						/>
					</div>
				)}
				<div className="mb-3">
					<label
						htmlFor={imageFileId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Or upload from your computer
					</label>
					<input
						id={imageFileId}
						type="file"
						accept="image/*"
						onChange={handleFileUpload}
						className="w-full text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-600"
					/>
				</div>
				<div className="mb-3">
					<label
						htmlFor={imageAltId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Alt text (optional)
					</label>
					<input
						id={imageAltId}
						type="text"
						value={alt}
						onChange={(e) => setAlt(e.target.value)}
						placeholder="Describe the image"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				<div className="mb-4">
					<label
						htmlFor={imageWidthId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Width (optional)
					</label>
					<div className="flex gap-2">
						<input
							id={imageWidthId}
							type="text"
							value={width}
							onChange={(e) => setWidth(e.target.value)}
							placeholder="e.g., 500px, 50%, auto"
							className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
						/>
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => setWidth("25%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								25%
							</button>
							<button
								type="button"
								onClick={() => setWidth("50%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								50%
							</button>
							<button
								type="button"
								onClick={() => setWidth("75%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								75%
							</button>
							<button
								type="button"
								onClick={() => setWidth("100%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								100%
							</button>
						</div>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded px-4 py-2 text-sm text-neutral-400 hover:text-white"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!url}
						className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Insert
					</button>
				</div>
			</form>
		</Modal>
	);
}

function Toolbar({ editor }: ToolbarProps) {
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [showImageModal, setShowImageModal] = useState(false);

	const handleLinkSubmit = useCallback(
		(url: string) => {
			if (editor) {
				editor.chain().focus().setLink({ href: url }).run();
			}
		},
		[editor],
	);

	const handleImageSubmit = useCallback(
		(url: string, alt?: string, width?: string) => {
			if (editor) {
				if (width) {
					editor
						.chain()
						.focus()
						.setImage({
							src: url,
							alt: alt || "",
						})
						.updateAttributes("image", { style: `width: ${width}` })
						.run();
				} else {
					editor
						.chain()
						.focus()
						.setImage({
							src: url,
							alt: alt || "",
						})
						.run();
				}
			}
		},
		[editor],
	);

	if (!editor) return null;

	return (
		<>
			<LinkModal
				isOpen={showLinkModal}
				onClose={() => setShowLinkModal(false)}
				onSubmit={handleLinkSubmit}
				initialUrl={editor.getAttributes("link").href || ""}
			/>
			<ImageModal
				isOpen={showImageModal}
				onClose={() => setShowImageModal(false)}
				onSubmit={handleImageSubmit}
			/>
			<div className="flex flex-wrap gap-1 border-b border-neutral-700 bg-neutral-900 p-2">
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBold().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("bold")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					<strong>B</strong>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleItalic().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("italic")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					<em>I</em>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleStrike().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("strike")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					<s>S</s>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleCode().run()}
					className={`rounded px-2 py-1 text-sm font-mono ${
						editor.isActive("code")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					{"</>"}
				</button>
				<div className="mx-1 w-px bg-neutral-700" />
				<button
					type="button"
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 1 }).run()
					}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("heading", { level: 1 })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					H1
				</button>
				<button
					type="button"
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 2 }).run()
					}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("heading", { level: 2 })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					H2
				</button>
				<button
					type="button"
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 3 }).run()
					}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("heading", { level: 3 })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					H3
				</button>
				<div className="mx-1 w-px bg-neutral-700" />
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("bulletList")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					• List
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("orderedList")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					1. List
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBlockquote().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("blockquote")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					Quote
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleCodeBlock().run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("codeBlock")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					Code
				</button>
				{editor.isActive("codeBlock") && (
					<select
						value={editor.getAttributes("codeBlock").language || ""}
						onChange={(e) =>
							editor
								.chain()
								.focus()
								.updateAttributes("codeBlock", { language: e.target.value })
								.run()
						}
						className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-300 border border-neutral-700"
					>
						<option value="">Plain text</option>
						<option value="javascript">JavaScript</option>
						<option value="typescript">TypeScript</option>
						<option value="python">Python</option>
						<option value="rust">Rust</option>
						<option value="go">Go</option>
						<option value="html">HTML</option>
						<option value="css">CSS</option>
						<option value="json">JSON</option>
						<option value="bash">Bash</option>
						<option value="sql">SQL</option>
						<option value="yaml">YAML</option>
						<option value="terraform">Terraform</option>
						<option value="hcl">HCL</option>
					</select>
				)}
				<div className="mx-1 w-px bg-neutral-700" />
				<button
					type="button"
					onClick={() => editor.chain().focus().setTextAlign("left").run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive({ textAlign: "left" })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
					title="Align left"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z" />
					</svg>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().setTextAlign("center").run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive({ textAlign: "center" })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
					title="Align center"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z" />
					</svg>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().setTextAlign("right").run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive({ textAlign: "right" })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
					title="Align right"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z" />
					</svg>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().setTextAlign("justify").run()}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive({ textAlign: "justify" })
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
					title="Justify"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />
					</svg>
				</button>
				<div className="mx-1 w-px bg-neutral-700" />
				<button
					type="button"
					onClick={() => setShowLinkModal(true)}
					className={`rounded px-2 py-1 text-sm ${
						editor.isActive("link")
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:bg-neutral-800 hover:text-white"
					}`}
				>
					Link
				</button>
				<button
					type="button"
					onClick={() => setShowImageModal(true)}
					className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
				>
					Image
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().setHorizontalRule().run()}
					className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
				>
					—
				</button>
				<div className="mx-1 w-px bg-neutral-700" />
				<button
					type="button"
					onClick={() => {
						const { from, to } = editor.state.selection;
						const selectedText = editor.state.doc.textBetween(from, to);
						if (selectedText) {
							editor.chain().focus().insertContent(`$${selectedText}$`).run();
						} else {
							editor.chain().focus().insertContent("$E = mc^2$").run();
						}
					}}
					className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white font-serif italic"
					title="Inline math (e.g., $E = mc^2$)"
				>
					∑
				</button>
				<button
					type="button"
					onClick={() => {
						const { from, to } = editor.state.selection;
						const selectedText = editor.state.doc.textBetween(from, to);
						if (selectedText) {
							editor
								.chain()
								.focus()
								.insertContent(`\n$$\n${selectedText}\n$$\n`)
								.run();
						} else {
							editor
								.chain()
								.focus()
								.insertContent("\n$$\n\\int_0^\\infty e^{-x^2} dx\n$$\n")
								.run();
						}
					}}
					className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white font-serif italic"
					title="Block math (e.g., $$\\int_0^1 x^2 dx$$)"
				>
					∫
				</button>
			</div>
		</>
	);
}

export const MarkdownEditor = forwardRef<
	MarkdownEditorMethods,
	MarkdownEditorProps
>(({ value, onChange, placeholder }, ref) => {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				codeBlock: false,
			}),
			CodeBlockLowlight.configure({
				lowlight,
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					class:
						"text-blue-400 underline underline-offset-2 hover:text-blue-300",
				},
			}),
			ResizableImage.configure({
				HTMLAttributes: {
					class: "rounded-lg max-w-full",
				},
			}),
			TextAlign.configure({
				types: ["heading", "paragraph"],
			}),
			Placeholder.configure({
				placeholder: placeholder || "Start writing...",
			}),
		],
		content: value,
		editorProps: {
			attributes: {
				class:
					"prose prose-invert max-w-none min-h-[500px] p-4 focus:outline-none",
			},
			handlePaste(view, event) {
				const plainText = event.clipboardData?.getData("text/plain") || "";
				if (!plainText || !isLikelyMarkdown(plainText)) {
					return false;
				}

				event.preventDefault();
				const html = convertMarkdownPasteToHtml(plainText);
				editor
					?.chain()
					.focus()
					.insertContent(html, { parseOptions: { preserveWhitespace: "full" } })
					.run();
				return true;
			},
		},
		onUpdate: ({ editor }) => {
			onChange(editor.getHTML());
		},
	});

	useEffect(() => {
		if (editor && value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	}, [value, editor]);

	useImperativeHandle(ref, () => ({
		getHTML: () => editor?.getHTML() || "",
		setContent: (content: string) => {
			editor?.commands.setContent(content);
		},
		focus: () => {
			editor?.commands.focus();
		},
	}));

	return (
		<div className="markdown-editor-wrapper">
			<Toolbar editor={editor} />
			<EditorContent editor={editor} className="tiptap-editor" />
		</div>
	);
});

MarkdownEditor.displayName = "MarkdownEditor";
