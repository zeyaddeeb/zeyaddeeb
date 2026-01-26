"use client";

import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import {
	BlockTypeSelect,
	BoldItalicUnderlineToggles,
	ChangeCodeMirrorLanguage,
	CodeToggle,
	ConditionalContents,
	CreateLink,
	codeBlockPlugin,
	codeMirrorPlugin,
	DiffSourceToggleWrapper,
	diffSourcePlugin,
	frontmatterPlugin,
	headingsPlugin,
	InsertCodeBlock,
	InsertImage,
	InsertTable,
	InsertThematicBreak,
	imagePlugin,
	ListsToggle,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	MDXEditor,
	type MDXEditorMethods,
	markdownShortcutPlugin,
	quotePlugin,
	tablePlugin,
	thematicBreakPlugin,
	toolbarPlugin,
	UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./markdown-editor.css";
import { forwardRef } from "react";

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export const MarkdownEditor = forwardRef<MDXEditorMethods, MarkdownEditorProps>(
	({ value, onChange, placeholder }, ref) => {
		return (
			<div
				className="markdown-editor-wrapper"
				onKeyDownCapture={(e) => e.stopPropagation()}
			>
				<MDXEditor
					ref={ref}
					markdown={value}
					onChange={onChange}
					placeholder={placeholder}
					contentEditableClassName="prose prose-invert max-w-none min-h-[500px] p-4"
					plugins={[
						headingsPlugin(),
						listsPlugin(),
						quotePlugin(),
						thematicBreakPlugin(),
						markdownShortcutPlugin(),
						linkPlugin(),
						linkDialogPlugin(),
						imagePlugin(),
						tablePlugin(),
						codeBlockPlugin({ defaultCodeBlockLanguage: "typescript" }),
						codeMirrorPlugin({
							codeBlockLanguages: {
								js: "JavaScript",
								javascript: "JavaScript",
								ts: "TypeScript",
								typescript: "TypeScript",
								tsx: "TypeScript (React)",
								jsx: "JavaScript (React)",
								css: "CSS",
								html: "HTML",
								json: "JSON",
								python: "Python",
								bash: "Bash",
								shell: "Shell",
								sql: "SQL",
								go: "Go",
								rust: "Rust",
								yaml: "YAML",
								markdown: "Markdown",
								text: "Plain Text",
							},
							codeMirrorExtensions: [
								javascript({ jsx: true, typescript: true }),
								python(),
								html(),
								css(),
								json(),
								markdown(),
								sql(),
								rust(),
								go(),
								yaml(),
							],
						}),
						diffSourcePlugin({ viewMode: "rich-text" }),
						frontmatterPlugin(),
						toolbarPlugin({
							toolbarContents: () => (
								<DiffSourceToggleWrapper>
									<ConditionalContents
										options={[
											{
												when: (editor) => editor?.editorType === "codeblock",
												contents: () => <ChangeCodeMirrorLanguage />,
											},
											{
												fallback: () => (
													<>
														<UndoRedo />
														<BlockTypeSelect />
														<BoldItalicUnderlineToggles />
														<CodeToggle />
														<CreateLink />
														<InsertImage />
														<ListsToggle />
														<InsertTable />
														<InsertThematicBreak />
														<InsertCodeBlock />
													</>
												),
											},
										]}
									/>
								</DiffSourceToggleWrapper>
							),
						}),
					]}
				/>
			</div>
		);
	},
);

MarkdownEditor.displayName = "MarkdownEditor";
