function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function isLikelyMarkdown(text: string): boolean {
	return /```|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/m.test(
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
			blocks.push(
				`<h${level}>${formatInlineMarkdown(headingMatch[2].trim())}</h${level}>`,
			);
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
			blocks.push(
				`<blockquote><p>${formatInlineMarkdown(quoteLines.join("\n")).replace(/\n/g, "<br />")}</p></blockquote>`,
			);
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

export function convertMarkdownPasteToHtml(markdown: string): string {
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
		const className = language ? ` class="language-${language}"` : "";
		blocks.push(`<pre><code${className}>${escapeHtml(code)}</code></pre>`);
		cursor = start + match[0].length;
	}

	pushTextBlock(normalized.slice(cursor));
	return blocks.join("\n");
}
