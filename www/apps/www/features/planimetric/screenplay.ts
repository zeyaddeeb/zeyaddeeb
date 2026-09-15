export type SetupName =
	| "WIDE"
	| "DOLLY"
	| "WHIP"
	| "OVERHEAD"
	| "PORTRAIT"
	| "CARD"
	| "TABLEAU"
	| "PULL";

export type Move = "cut" | "dolly" | "whip" | "snap" | "crane" | "pull";
export type Placement = "lobby" | "corridor" | "cab";

export interface Setup {
	name: SetupName;
	label: string;
	move: Move;
	frames: string[];
	tall: string[];
	placement: Placement;
	seconds: number;
	lesson: { title: string; note: string; lens: string };
}

export const setups: Record<SetupName, Setup> = {
	WIDE: {
		name: "WIDE",
		label: "Wide",
		move: "cut",
		frames: ["600 1251 1200 649"],
		tall: ["820 1076 760 1267"],
		placement: "lobby",
		seconds: 4,
		lesson: {
			title: "Square to the wall.",
			note: "The camera stands at ninety degrees to the backdrop, the subject in the exact middle, the horizon at the lens. Order first. The joke can wait.",
			lens: "27 mm · locked off · straight cut",
		},
	},
	DOLLY: {
		name: "DOLLY",
		label: "Lateral dolly",
		move: "dolly",
		frames: ["100 740 1200 649", "1100 740 1200 649"],
		tall: ["350 383 700 1167", "1350 383 700 1167"],
		placement: "corridor",
		seconds: 5,
		lesson: {
			title: "Track at the speed of the walk.",
			note: "The camera slides on rails, parallel to the wall, at exactly the pace of the person. The world scrolls past. The person stays put.",
			lens: "40 mm · lateral track, constant speed",
		},
	},
	WHIP: {
		name: "WHIP",
		label: "Whip pan",
		move: "whip",
		frames: ["750 1414 900 486", "1950 1414 900 486"],
		tall: ["930 1200 540 900", "2130 1200 540 900"],
		placement: "lobby",
		seconds: 3,
		lesson: {
			title: "Turn the head, not the body.",
			note: "From one centred composition to the next in a third of a second. It is a cut you can feel in your neck.",
			lens: "40 mm · whip pan, 300 ms",
		},
	},
	OVERHEAD: {
		name: "OVERHEAD",
		label: "Overhead insert",
		move: "cut",
		frames: ["4100 300 1600 865"],
		tall: ["4500 250 800 1333"],
		placement: "lobby",
		seconds: 4,
		lesson: {
			title: "God’s eye on the evidence.",
			note: "Straight down onto the desk. Objects laid out like a police inventory. Hands enter from the edge of the frame and nothing else moves.",
			lens: "50 mm · top-down insert",
		},
	},
	PORTRAIT: {
		name: "PORTRAIT",
		label: "Portrait, snap zoom",
		move: "snap",
		frames: ["650 1411 700 378", "755 1467 490 265", "825 1505 350 189"],
		tall: ["790 1250 420 700", "850 1330 300 500", "890 1380 220 367"],
		placement: "lobby",
		seconds: 4,
		lesson: {
			title: "Punch in on the understatement.",
			note: "Centre the face. Hold. Then snap the zoom on the line nobody reacts to. Three steps, never a glide.",
			lens: "50 → 85 mm · snap zoom",
		},
	},
	CARD: {
		name: "CARD",
		label: "Chapter card",
		move: "cut",
		frames: ["4100 1300 1600 865"],
		tall: ["4500 1065 800 1333"],
		placement: "lobby",
		seconds: 3,
		lesson: {
			title: "Announce the chapter.",
			note: "A flat field of colour and a Futura headline, held long enough to read twice. The story pauses to admit it is a story.",
			lens: "Title card · centred type",
		},
	},
	TABLEAU: {
		name: "TABLEAU",
		label: "Elevator tableau",
		move: "crane",
		frames: ["1800 1275 1200 649", "1800 755 1200 649"],
		tall: ["2050 1200 700 1167", "2050 680 700 1167"],
		placement: "cab",
		seconds: 5,
		lesson: {
			title: "Rise with the cab.",
			note: "Three people in a row, facing the lens, nobody moving. The camera goes up with them as if it were also a passenger.",
			lens: "27 mm · vertical crane",
		},
	},
	PULL: {
		name: "PULL",
		label: "Pull back",
		move: "pull",
		frames: ["1800 755 1200 649", "0 -108 4000 2162"],
		tall: ["2050 680 700 1167", "1000 -100 2000 3333"],
		placement: "cab",
		seconds: 6,
		lesson: {
			title: "Show the whole house.",
			note: "Pull back until the building becomes a doll’s house. Every room you visited is still there, side by side, at once.",
			lens: "18 mm · pull-back reveal",
		},
	},
};

export const SETUP_NAMES = Object.keys(setups) as SetupName[];
export const MAX_SHOTS = 10;

export interface Shot {
	setup: SetupName;
	duration: number;
	action: string;
	character: string;
	parenthetical: string;
	dialogue: string;
	line: number;
}

export interface Screenplay {
	heading: string;
	shots: Shot[];
}

export interface Cue {
	shot: Shot;
	index: number;
	start: number;
	end: number;
}

export const SCRIPT_TITLE = "Checkout Pending";

export const INITIAL_SCRIPT = `INT. HOTEL KUBERNETES, OFF-SEASON - THURSDAY, 4:03 P.M.

[[WIDE 8]]
Anna, in mustard, stands at reception for the third time. Valentin, in black, regards this as excellent customer retention. Otto, in mint, awaits instructions. The reservation still calls for one guest.

NARRATOR
Anna had checked out three times. Hotel Kubernetes recorded three successful recoveries.

[[DOLLY 6]]
Otto walks the corridor past rooms 101 to 105. Every cancelled room must be prepared again. He is particularly proud of saving the breakfast.

OTTO
Room 104 is ready again. I rescued your croissant.

[[WHIP 6]]
From Valentin at reception to the empty lift, ready to return Anna to her room. To him, an empty hotel is a service failure.

M. VALENTIN
We guarantee one guest, madame. You are the one.

[[OVERHEAD 6]]
A room key, a checkout receipt, a fountain pen and a pastry box. Hands reach across the desk. The receipt and the still-valid key contradict each other.

ANNA
Checkout accepted. Then why does my key still work?

[[PORTRAIT 6]]
Anna holds perfectly still. The camera snaps closer as she identifies the problem: they keep removing the room, but the reservation keeps requesting a replacement.

ANNA
(with surgical patience)
Don't delete the room. Set the reservation to zero.

[[CARD 3]]
PART TWO: DESIRED STATE

[[TABLEAU 5]]
Anna, Valentin and Otto stand shoulder to shoulder in the lift. They ascend to Reservations. Valentin has come to supervise; Otto has come because nobody told him to stop helping.

OTTO
Reservations is upstairs. They only accept pull requests.

[[PULL 7]]
The camera pulls back from the lift to the whole hotel. The rooms remain immaculate, the linen folded, the pastries boxed. The system is working exactly as specified.

NARRATOR
Her checkout was approved. The next release was in November.`;

const HEADING = /^(INT|EXT|INT\.\/EXT|I\/E)[. ]/i;
const CUE = /^\[\[\s*([A-Z]+)(?:\s+(\d+(?:\.\d+)?))?\s*\]\]$/;
const CHARACTER = /^[A-Z][A-Z0-9 .'’-]{1,30}$/;

export function compile(source: string): {
	screenplay: Screenplay;
	error: string | null;
} {
	const shots: Shot[] = [];
	let heading = "";
	let mode: "action" | "dialogue" = "action";
	const fail = (error: string) => ({
		screenplay: { heading, shots: [] },
		error,
	});
	const lines = source.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		const n = i + 1;
		if (!line) {
			mode = "action";
			continue;
		}
		const shot = shots.at(-1);
		if (HEADING.test(line)) {
			if (!heading) heading = line.toUpperCase();
			else if (shot) shot.action += `${shot.action ? " " : ""}${line}`;
			continue;
		}
		if (line.startsWith("[[")) {
			const cue = line.match(CUE);
			const name = cue?.[1] as SetupName | undefined;
			if (!cue || !name || !(name in setups))
				return fail(
					`Line ${n}: a camera cue looks like [[WIDE 4]]. Setups: ${SETUP_NAMES.join(", ")}.`,
				);
			const duration = cue[2] ? Number(cue[2]) : setups[name].seconds;
			if (duration < 1 || duration > 12)
				return fail(`Line ${n}: a shot lasts between 1 and 12 seconds.`);
			if (shots.length >= MAX_SHOTS)
				return fail(`This reel holds at most ${MAX_SHOTS} shots.`);
			if (shot?.character && !shot.dialogue)
				return fail(
					`Line ${shot.line}: ${shot.character} needs a line of dialogue beneath the name.`,
				);
			shots.push({
				setup: name,
				duration,
				action: "",
				character: "",
				parenthetical: "",
				dialogue: "",
				line: n,
			});
			mode = "action";
			continue;
		}
		if (!shot)
			return fail(`Line ${n}: begin with a camera cue, such as [[WIDE 4]].`);
		if (mode === "dialogue") {
			if (/^\(.+\)$/.test(line) && !shot.dialogue) {
				shot.parenthetical = line.slice(1, -1);
			} else shot.dialogue += `${shot.dialogue ? " " : ""}${line}`;
			continue;
		}
		if (shot.setup !== "CARD" && CHARACTER.test(line) && /[A-Z]/.test(line)) {
			if (shot.character)
				return fail(
					`Line ${n}: one speaker per shot. Add a camera cue before ${line}.`,
				);
			shot.character = line;
			shot.line = n;
			mode = "dialogue";
			continue;
		}
		shot.action += `${shot.action ? " " : ""}${line}`;
	}
	const last = shots.at(-1);
	if (last?.character && !last.dialogue)
		return fail(
			`Line ${last.line}: ${last.character} needs a line of dialogue beneath the name.`,
		);
	if (!shots.length)
		return fail("Add a camera cue to begin, such as [[WIDE 4]].");
	return { screenplay: { heading, shots }, error: null };
}

export function schedule(shots: Shot[]): Cue[] {
	let start = 0;
	return shots.map((shot, index) => {
		const cue = { shot, index, start, end: start + shot.duration };
		start = cue.end;
		return cue;
	});
}

export function durationOf(cues: Cue[]) {
	return cues.at(-1)?.end ?? 0;
}

export function locate(cues: Cue[], time: number): Cue {
	for (const cue of cues) if (time < cue.end) return cue;
	return cues[cues.length - 1];
}

export function frameRect(frame: string) {
	const [x, y, w, h] = frame.split(" ").map(Number);
	return { x, y, w, h };
}

export function drawingFrame(shot: Shot) {
	const rects = setups[shot.setup].frames.map(frameRect);
	const left = Math.min(...rects.map((rect) => rect.x));
	const top = Math.min(...rects.map((rect) => rect.y));
	const right = Math.max(...rects.map((rect) => rect.x + rect.w));
	const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
	const width = (right - left) * 1.16;
	const height = (bottom - top) * 1.16;
	const w = Math.max(width, height * (4 / 3));
	const h = w * (3 / 4);
	return `${(left + right - w) / 2} ${(top + bottom - h) / 2} ${w} ${h}`;
}

export function framesFor(shot: Shot, tall = false) {
	const setup = setups[shot.setup];
	return tall ? setup.tall : setup.frames;
}

export function arrival(shot: Shot, tall = false) {
	const frames = framesFor(shot, tall);
	return frames[frames.length - 1];
}

export function format(screenplay: Screenplay) {
	const out: string[] = [];
	if (screenplay.heading) out.push(screenplay.heading, "");
	for (const shot of screenplay.shots) {
		out.push(`[[${shot.setup} ${shot.duration}]]`);
		if (shot.action) out.push(shot.action);
		if (shot.character) {
			out.push("", shot.character);
			if (shot.parenthetical) out.push(`(${shot.parenthetical})`);
			out.push(shot.dialogue);
		}
		out.push("");
	}
	return out.join("\n").trimEnd();
}
