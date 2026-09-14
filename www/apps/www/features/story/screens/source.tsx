"use client";

import { useEffect, useState } from "react";

const HOMEPAGE = `<html>
<head>
<title>zeyad's homepage</title>
<style>
  body { font-family: Verdana; background: #ffffcc; }
  h1 { color: navy; }
  .new { color: red; font-weight: bold; }
</style>
</head>
<body>
<h1>Welcome to my homepage!</h1>
<p>This page is <span class="new">under construction</span>.</p>
<hr>
<p>Things I like: computers, Prince of Persia, HTML.</p>
<p><a href="#">Sign my guestbook</a></p>
</body>
</html>`;

export function SourceScreen() {
	const [source, setSource] = useState(HOMEPAGE);
	const [doc, setDoc] = useState(HOMEPAGE);

	useEffect(() => {
		const id = setTimeout(() => setDoc(source), 160);
		return () => clearTimeout(id);
	}, [source]);

	return (
		<div className="source">
			<label className="source__pane">
				<span className="source__label">index.html</span>
				<textarea
					className="source__code"
					value={source}
					onChange={(e) => setSource(e.target.value)}
					spellCheck={false}
					aria-label="HTML source"
				/>
			</label>
			<div className="source__pane">
				<span className="source__label">Internet Explorer 6</span>
				<iframe
					className="source__render"
					title="Rendered page"
					sandbox=""
					srcDoc={doc}
				/>
			</div>
		</div>
	);
}
