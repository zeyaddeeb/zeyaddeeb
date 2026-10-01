import type { Editor } from "@tiptap/react";
import { useCallback, useState } from "react";
import { ImageModal, LinkModal } from "./editor-dialogs";

interface ToolbarProps {
	editor: Editor | null;
}

export function Toolbar({ editor }: ToolbarProps) {
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
