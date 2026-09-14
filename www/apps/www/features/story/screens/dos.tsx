"use client";

import { Shell, type ShellResult } from "./shell";

type Node =
	| { kind: "dir"; stamp: string; children: Record<string, Node> }
	| { kind: "file"; size: number; stamp: string; text?: string[] };

const dir = (
	children: Record<string, Node>,
	stamp = "03-10-94  9:12a",
): Node => ({
	kind: "dir",
	stamp,
	children,
});
const file = (
	size: number,
	text?: string[],
	stamp = "03-10-94  9:20a",
): Node => ({
	kind: "file",
	size,
	stamp,
	text,
});

const ROOT: Node = dir({
	DOS: dir({
		"FORMAT.COM": file(22_916),
		"EDIT.COM": file(413),
		"QBASIC.EXE": file(194_309),
		"HIMEM.SYS": file(33_046),
	}),
	GAMES: dir({
		PRINCE: dir({
			"PRINCE.EXE": file(115_398, undefined, "01-16-92 12:00a"),
			"PRINCE.DAT": file(240_128, undefined, "01-16-92 12:00a"),
			"README.TXT": file(196, [
				"PRINCE OF PERSIA",
				"Disk 1 of 2. Have Disk 2 ready.",
				"Type PRINCE to play.",
			]),
		}),
	}),
	"AUTOEXEC.BAT": file(212, [
		"@ECHO OFF",
		"PROMPT $p$g",
		"PATH C:\\DOS",
		"SET TEMP=C:\\DOS",
	]),
	"CONFIG.SYS": file(184, [
		"DEVICE=C:\\DOS\\HIMEM.SYS",
		"DOS=HIGH",
		"FILES=30",
		"BUFFERS=20",
	]),
	"COMMAND.COM": file(54_645, undefined, "09-30-93  6:20a"),
	"README.TXT": file(402, [
		"This machine belongs to Zeyad.",
		"Do not delete anything in C:\\DOS.",
		"The game is in C:\\GAMES\\PRINCE.",
		"Go there with CD, then type PRINCE.",
	]),
});

function resolve(path: string[]): Node | null {
	let node: Node = ROOT;
	for (const part of path) {
		if (node.kind !== "dir") return null;
		const next = node.children[part];
		if (!next) return null;
		node = next;
	}
	return node;
}

const promptFor = (cwd: string[]) => `C:\\${cwd.join("\\")}>`;

function shortName(name: string) {
	const [base, ext = ""] = name.split(".");
	return `${(base ?? "").padEnd(8)} ${ext.padEnd(3)}`;
}

function listing(cwd: string[]): string[] {
	const node = resolve(cwd);
	if (node?.kind !== "dir") return ["Path not found"];
	const entries = Object.entries(node.children);
	const lines = [
		" Volume in drive C is ZD",
		` Directory of C:\\${cwd.join("\\")}`,
		"",
	];
	let files = 0;
	let bytes = 0;
	for (const [name, child] of entries) {
		if (child.kind === "dir") {
			lines.push(`${shortName(name)} <DIR>          ${child.stamp}`);
		} else {
			files++;
			bytes += child.size;
			lines.push(
				`${shortName(name)} ${child.size.toLocaleString("en-US").padStart(11)} ${child.stamp}`,
			);
		}
	}
	lines.push(
		`${String(files).padStart(9)} file(s) ${bytes.toLocaleString("en-US").padStart(12)} bytes`,
		`${String(entries.length - files).padStart(9)} dir(s)   98,304,000 bytes free`,
	);
	return lines;
}

function changeDir(
	cwd: string[],
	arg: string,
): { cwd: string[]; error?: string } {
	if (!arg) return { cwd };
	let next = arg.startsWith("\\") || arg.startsWith("C:") ? [] : [...cwd];
	for (const part of arg.replace(/^C:/i, "").split(/[\\/]/).filter(Boolean)) {
		if (part === ".") continue;
		if (part === "..") {
			next.pop();
			continue;
		}
		const node = resolve([...next, part.toUpperCase()]);
		if (node?.kind !== "dir") return { cwd, error: "Invalid directory" };
		next = [...next, part.toUpperCase()];
	}
	return { cwd: next };
}

function makeRunner() {
	let cwd: string[] = [];

	return (input: string): ShellResult => {
		const trimmed = input.trim();
		if (!trimmed) return {};
		const [rawCmd, ...rest] = trimmed.split(/\s+/);
		const cmd = (rawCmd ?? "")
			.toUpperCase()
			.replace(/^CD(?=\S)/, "CD ")
			.trim();
		const arg =
			cmd === "CD" && rawCmd && rawCmd.length > 2 && !rest.length
				? rawCmd.slice(2)
				: rest.join(" ");

		switch (cmd) {
			case "DIR":
				return { lines: [...listing(cwd), ""] };
			case "CD":
			case "CHDIR": {
				if (!arg) return { lines: [`C:\\${cwd.join("\\")}`, ""] };
				const moved = changeDir(cwd, arg);
				cwd = moved.cwd;
				return {
					lines: moved.error ? [moved.error, ""] : [],
					prompt: promptFor(cwd),
				};
			}
			case "CD..":
				cwd = cwd.slice(0, -1);
				return { prompt: promptFor(cwd) };
			case "CD\\":
				cwd = [];
				return { prompt: promptFor(cwd) };
			case "CLS":
				return { clear: true };
			case "VER":
				return { lines: ["", "MS-DOS Version 6.22", ""] };
			case "ECHO":
				return { lines: [arg || "ECHO is on", ""] };
			case "DATE":
				return {
					lines: [
						`Current date is ${new Date().toLocaleDateString("en-US")}`,
						"",
					],
				};
			case "TIME":
				return {
					lines: [
						`Current time is ${new Date().toLocaleTimeString("en-US")}`,
						"",
					],
				};
			case "TYPE": {
				const node = resolve([...cwd, arg.toUpperCase()]);
				if (node?.kind !== "file") return { lines: ["File not found", ""] };
				return { lines: [...(node.text ?? ["(binary)"]), ""] };
			}
			case "HELP":
				return {
					lines: [
						"DIR      Lists the files in a directory.",
						"CD       Changes to another directory.",
						"TYPE     Displays a text file.",
						"CLS      Clears the screen.",
						"VER      Displays the MS-DOS version.",
						"",
					],
				};
			case "EXIT":
				return { lines: ["There is nowhere to exit to. Scroll on.", ""] };
			default: {
				const name = `${cmd}${cmd.includes(".") ? "" : ".EXE"}`;
				const here = resolve([...cwd, name]);
				if (here?.kind === "file" && name === "PRINCE.EXE") {
					return {
						lines: ["Loading PRINCE.EXE from drive A:..."],
						launch: "floppy",
					};
				}
				if (here?.kind === "file") return { lines: ["Not enough memory", ""] };
				return { lines: ["Bad command or file name", ""] };
			}
		}
	};
}

export function DosScreen({
	onLaunch,
}: {
	onLaunch: (program: string) => void;
}) {
	return (
		<Shell
			label="MS-DOS prompt"
			prompt={promptFor([])}
			banner={[
				"Starting MS-DOS...",
				"",
				"HIMEM is testing extended memory...done.",
				"",
			]}
			run={makeRunner()}
			onLaunch={onLaunch}
		/>
	);
}
