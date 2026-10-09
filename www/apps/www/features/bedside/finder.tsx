"use client";

import { type KeyboardEvent, useState } from "react";

const SHOWN = 6;

export function Finder({
	value,
	names,
	onChange,
	onFocus,
}: {
	value: string;
	names: readonly string[];
	onChange: (value: string) => void;
	onFocus: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const query = value.trim().toUpperCase();
	const options = query
		? names
				.filter((n) => n.toUpperCase().startsWith(query))
				.filter((n) => n.toUpperCase() !== query)
				.slice(0, SHOWN)
		: [];
	const shown = open && options.length > 0;

	const pick = (name: string) => {
		onChange(name);
		setOpen(false);
	};

	const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			setOpen(false);
			return;
		}

		if (!shown) return;

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((active + step + options.length) % options.length);
		}

		if (event.key === "Enter") {
			event.preventDefault();
			pick(options[active] ?? value);
		}
	};

	return (
		<div className="lt-find">
			<input
				type="text"
				role="combobox"
				aria-label="Find a gene"
				aria-expanded={shown}
				aria-controls="lt-find-list"
				aria-autocomplete="list"
				aria-activedescendant={shown ? `lt-find-${active}` : undefined}
				value={value}
				placeholder="Find a gene"
				autoComplete="off"
				spellCheck={false}
				onFocus={() => {
					setOpen(true);
					onFocus();
				}}
				onBlur={() => setOpen(false)}
				onKeyDown={onKey}
				onChange={(e) => {
					onChange(e.target.value);
					setActive(0);
					setOpen(true);
				}}
			/>
			<div
				id="lt-find-list"
				role="listbox"
				className="lt-find__list"
				hidden={!shown}
			>
				{options.map((n, i) => (
					<div
						key={n}
						id={`lt-find-${i}`}
						role="option"
						tabIndex={-1}
						aria-selected={i === active}
						className="lt-find__option"
						onPointerDown={(e) => {
							e.preventDefault();
							pick(n);
						}}
					>
						{n}
					</div>
				))}
			</div>
		</div>
	);
}
