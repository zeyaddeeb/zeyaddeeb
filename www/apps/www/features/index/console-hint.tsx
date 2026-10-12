"use client";

import { useEffect } from "react";
import { secrets } from "@/features/catalog/catalog";

const PROMPT = "C:\\EXPERIMENTS>";
const RELEASED = "01/07/2003  12:00 AM";
const SCREEN =
	"background:#000;color:#c0c0c0;font:12px/1.5 'Lucida Console',Consolas,Menlo,monospace";
const BUTTON =
	"padding:2px 12px 3px 8px;border-radius:0 10px 10px 0;background:#3fa33f;color:#fff;font:italic 700 13px 'Trebuchet MS',Tahoma,sans-serif";
const PLAIN = "font:13px Tahoma,sans-serif";

let told = false;

const folder = (href: string) => href.split("/").at(-1) ?? "";

const short = (name: string) =>
	`${name
		.replace(/[^a-z0-9]/gi, "")
		.slice(0, 6)
		.toUpperCase()}~1`;

function listing() {
	const rows = secrets.map(
		({ href }) =>
			`${RELEASED}    <DIR>          ${short(folder(href)).padEnd(12)} ${folder(href)}`,
	);
	const lines = [
		"",
		`${PROMPT}dir /a:h /x`,
		"",
		" Directory of C:\\EXPERIMENTS",
		"",
		...rows,
		`${String(rows.length).padStart(16)} Dir(s)  nobody was meant to find`,
		"",
		`${PROMPT}_`,
		"",
	];

	const wide = Math.max(...lines.map((line) => line.length)) + 2;

	return lines.map((line) => ` ${line}`.padEnd(wide)).join("\n");
}

function tell(href: string) {
	console.log(`%c${listing()}`, SCREEN);
	console.log(
		`%cstart%c() and Enter opens it. Or click ${window.location.origin}${href}`,
		BUTTON,
		PLAIN,
	);
}

export function ConsoleHint() {
	useEffect(() => {
		const [first] = secrets;

		if (!first) return;

		Object.assign(window, {
			start: () => window.location.assign(first.href),
		});

		if (!told) tell(first.href);

		told = true;

		return () => {
			Reflect.deleteProperty(window, "start");
		};
	}, []);

	return null;
}
