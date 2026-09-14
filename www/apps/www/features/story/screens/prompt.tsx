"use client";

import { BLOG_URL } from "@zeyaddeeb/ui";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { usePresence } from "@/features/live/presence";
import { Shell, type ShellResult } from "./shell";

const PLACES: Record<string, string> = {
	home: "/",
	about: "/about",
	experiments: "/experiments",
	blog: BLOG_URL,
	library: `${BLOG_URL}/library`,
	resume: "/resume",
	story: "/story",
};

export function PromptScreen() {
	const router = useRouter();
	const { peers, status } = usePresence();
	const here = useRef(0);
	here.current = status === "online" && peers !== null ? peers : 0;

	const run = (input: string): ShellResult => {
		const trimmed = input.trim();
		if (!trimmed) return {};
		const [cmd = "", ...rest] = trimmed.split(/\s+/);
		const arg = rest.join(" ");
		const name = cmd.toLowerCase();

		const open = (place: string) => {
			const key = place.replace(/^\//, "").replace(/\/$/, "").toLowerCase();
			const href = PLACES[key || "home"];
			if (!href) return { lines: [`cd: no such place: ${place}`, ""] };
			if (href === "/story") return { lines: ["You are here.", ""] };
			if (href.startsWith("http://") || href.startsWith("https://")) {
				window.location.assign(href);
			} else {
				router.push(href);
			}
			return { lines: [`opening ${href}…`] };
		};

		switch (name) {
			case "help":
				return {
					lines: [
						"ls           what is on this site",
						"cd <place>   go there (about, experiments, blog, library, resume)",
						"whoami       who is here",
						"clear        wipe the screen",
						"",
					],
				};
			case "ls":
				return {
					lines: [
						Object.keys(PLACES)
							.filter((k) => k !== "home")
							.map((k) => `${k}/`)
							.join("  "),
						"",
					],
				};
			case "pwd":
				return { lines: ["/story", ""] };
			case "cd":
			case "open":
				return open(arg || "home");
			case "whoami": {
				const others = Math.max(here.current - 1, 0);
				return {
					lines: [
						others === 0
							? "a visitor. Nobody else is here right now."
							: others === 1
								? "a visitor. One other person is here right now."
								: `a visitor. ${others} other people are here right now.`,
						"",
					],
				};
			}
			case "date":
				return { lines: [new Date().toString(), ""] };
			case "echo":
				return { lines: [arg, ""] };
			case "clear":
				return { clear: true };
			case "dir":
				return { lines: ["That was thirty years ago. Try ls.", ""] };
			default:
				if (PLACES[name]) return open(name);
				return { lines: [`sh: command not found: ${cmd}. Try help.`, ""] };
		}
	};

	return (
		<Shell
			label="Shell"
			prompt="zeyad@now:~/story $ "
			banner={["The cursor is still here. Type help.", ""]}
			run={run}
			idle="click to type"
		/>
	);
}
