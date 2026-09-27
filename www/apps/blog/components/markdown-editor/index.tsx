"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import "highlight.js/styles/github-dark.css";
import { all, createLowlight } from "lowlight";
import { useEffect } from "react";
import { highlightLanguages } from "@/lib/highlight-languages";
import "../markdown-content.css";
import "./markdown-editor.css";
import { convertMarkdownPasteToHtml, isLikelyMarkdown } from "./markdown-paste";
import { ResizableImage } from "./resizable-image";
import { Toolbar } from "./toolbar";

const lowlight = createLowlight(all);
lowlight.register(highlightLanguages);

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function MarkdownEditor({
	value,
	onChange,
	placeholder,
}: MarkdownEditorProps) {
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
			handlePaste(_view, event) {
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

	return (
		<div className="markdown-editor-wrapper">
			<Toolbar editor={editor} />
			<EditorContent editor={editor} className="tiptap-editor" />
		</div>
	);
}
