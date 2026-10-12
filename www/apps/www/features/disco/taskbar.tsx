"use client";

import { useEffect, useState } from "react";
import { Glyph, Triad } from "./glyph";

function TrayClock() {
	const [time, setTime] = useState<string | null>(null);

	useEffect(() => {
		const format = new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
		});
		const tell = () => setTime(format.format(new Date()));

		tell();

		const timer = setInterval(tell, 15000);

		return () => clearInterval(timer);
	}, []);

	return <span className="dd-clock">{time}</span>;
}

interface TaskbarProps {
	shown: boolean;
	muted: boolean;
	menu: boolean;
	pinned: boolean | null;
	onMenu: (open: boolean) => void;
	onWindow: (shown: boolean) => void;
	onMute: () => void;
	onPin: () => void;
}

export function Taskbar({
	shown,
	muted,
	menu,
	onMenu,
	onWindow,
	onMute,
	onPin,
	pinned,
}: TaskbarProps) {
	return (
		<>
			{menu ? (
				<>
					<button
						type="button"
						className="dd-menu__away"
						aria-label="Close the start menu"
						onClick={() => onMenu(false)}
					/>
					<div className="dd-menu">
						<p className="dd-menu__head">
							<Triad size={22} />
							Desktop Disco
						</p>
						<button
							type="button"
							className="dd-menu__item"
							onClick={() => {
								onWindow(true);
								onMenu(false);
							}}
						>
							<Glyph name="note" />
							Media Player
						</button>
						<a className="dd-menu__item" href="#notes">
							<Glyph name="next" />
							Where the dancers came from
						</a>
					</div>
				</>
			) : null}
			<footer className="dd-bar">
				<button
					type="button"
					className="dd-start"
					aria-expanded={menu}
					onClick={() => onMenu(!menu)}
				>
					<Triad />
					<span>start</span>
				</button>
				<button
					type="button"
					className="dd-task"
					aria-pressed={shown}
					onClick={() => onWindow(!shown)}
				>
					<Glyph name="note" size={14} />
					<span>Media Player</span>
				</button>
				<div className="dd-tray">
					<button
						type="button"
						className="dd-tray__sound"
						data-absent={pinned === null || undefined}
						disabled={pinned === null}
						aria-label="Keep the dancers on top of your other windows"
						title="Keep the dancers on top"
						aria-pressed={Boolean(pinned)}
						onClick={onPin}
					>
						<Glyph name="pin" size={14} />
					</button>
					<button
						type="button"
						className="dd-tray__sound"
						aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
						title={muted ? "Sound is off" : "Sound is on"}
						aria-pressed={muted}
						onClick={onMute}
					>
						<Glyph name={muted ? "muted" : "sound"} size={14} />
					</button>
					<TrayClock />
				</div>
			</footer>
		</>
	);
}
