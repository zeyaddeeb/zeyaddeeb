"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import "highlight.js/styles/github-dark.css";
import { all, createLowlight } from "lowlight";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useState,
} from "react";
import { createPortal } from "react-dom";
import "./markdown-editor.css";

const lowlight = createLowlight(all);

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
			<div className="relative z-10 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
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
			</div>
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

	useEffect(() => {
		setUrl(initialUrl);
		setText(initialText);
	}, [initialUrl, initialText, isOpen]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
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
						htmlFor="link-url"
						className="mb-1 block text-sm text-neutral-400"
					>
						URL
					</label>
					<input
						id="link-url"
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
	onSubmit: (url: string, alt?: string) => void;
}

function ImageModal({ isOpen, onClose, onSubmit }: ImageModalProps) {
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (url) {
			onSubmit(url, alt);
			onClose();
			setUrl("");
			setAlt("");
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
						htmlFor="image-url"
						className="mb-1 block text-sm text-neutral-400"
					>
						Image URL
					</label>
					<input
						id="image-url"
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/image.jpg"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				<div className="mb-3">
					<label
						htmlFor="image-file"
						className="mb-1 block text-sm text-neutral-400"
					>
						Or upload from your computer
					</label>
					<input
						id="image-file"
						type="file"
						accept="image/*"
						onChange={handleFileUpload}
						className="w-full text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-600"
					/>
				</div>
				<div className="mb-4">
					<label
						htmlFor="image-alt"
						className="mb-1 block text-sm text-neutral-400"
					>
						Alt text (optional)
					</label>
					<input
						id="image-alt"
						type="text"
						value={alt}
						onChange={(e) => setAlt(e.target.value)}
						placeholder="Describe the image"
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
		(url: string, alt?: string) => {
			if (editor) {
				editor
					.chain()
					.focus()
					.setImage({ src: url, alt: alt || "" })
					.run();
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
					</select>
				)}
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
			Image.configure({
				HTMLAttributes: {
					class: "rounded-lg max-w-full",
				},
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
