import { ms } from "./copy";
import type { Seen } from "./protocol";
import { leastKm, lightMs, SITES, type Site } from "./sites";
import type { Sites } from "./use-dealer";

const CHOICES: [Site, Site][] = [
	[SITES[0], SITES[1]],
	[SITES[0], SITES[2]],
	[SITES[1], SITES[2]],
].filter((p): p is [Site, Site] => Boolean(p[0] && p[1]));

const key = (pair: readonly Site[]) => pair.map((s) => s.id).join("|");

function status(seen: Seen | undefined, sites: Sites | null) {
	if (!sites) return { state: "checking", text: "checking", title: "" };
	if (sites.off)
		return {
			state: "off",
			text: "dealer off",
			title: "The dealer did not answer.",
		};
	if (!seen?.live)
		return {
			state: "dark",
			text: "dark",
			title: "This station did not answer.",
		};

	const rtt = ms((seen.rtt_us ?? 0) / 1000, 0);

	return seen.clock?.measured
		? {
				state: "live",
				text: `${rtt} · ±${((seen.clock.bound_ns ?? 0) / 1e6).toFixed(2)}`,
				title: `Round trip from the dealer ${rtt}. Clock within ±${ms((seen.clock.bound_ns ?? 0) / 1e6, 2)}.`,
			}
		: {
				state: "live",
				text: `${rtt} · no clock`,
				title: `Round trip from the dealer ${rtt}. Its time server did not answer.`,
			};
}

export function Stations({
	sites,
	pair,
	onPick,
}: {
	sites: Sites | null;
	pair: [Site, Site];
	onPick: (pair: [Site, Site]) => void;
}) {
	const live = (s: Site) =>
		!sites ||
		sites.off ||
		Boolean(sites.seen.find((x) => x.site === s.id)?.live);

	return (
		<div className="me-stations">
			<ul className="me-sites">
				{SITES.map((s) => {
					const st = status(
						sites?.seen.find((x) => x.site === s.id),
						sites,
					);

					return (
						<li
							key={s.id}
							className="me-site"
							data-state={st.state}
							data-in={pair.includes(s) || undefined}
						>
							<span className="me-site__place">{s.short}</span>
							<span className="me-site__cloud">{s.cloud}</span>
							<span className="me-site__status" title={st.title || undefined}>
								<span className="me-site__dot" aria-hidden="true" />
								{st.text}
							</span>
						</li>
					);
				})}
			</ul>
			<fieldset className="me-pairs">
				<legend className="me-pairs__legend">Stations for the next deal</legend>
				{CHOICES.map((choice) => (
					<button
						key={key(choice)}
						type="button"
						className="me-pair"
						aria-pressed={key(choice) === key(pair)}
						disabled={!choice.every(live)}
						onClick={() => onPick(choice)}
					>
						<span>
							{choice[0].tag} · {choice[1].tag}
						</span>
						<span className="me-pair__light">
							{ms(lightMs(leastKm(choice[0], choice[1])), 1)}
						</span>
					</button>
				))}
			</fieldset>
		</div>
	);
}

const LABS = [
	{
		id: "a",
		place: "Lab A",
		what: "electron spin in diamond",
		note: "random axis in 160 ns",
	},
	{
		id: "c",
		place: "Lab C",
		what: "photons from A and B meet",
		note: "heralds each pair",
	},
	{
		id: "b",
		place: "Lab B",
		what: "electron spin in diamond",
		note: "1,280 m from A",
	},
] as const;

export function DelftStations() {
	return (
		<div className="me-stations">
			<ul className="me-sites">
				{LABS.map((lab) => (
					<li
						key={lab.id}
						className="me-site"
						data-state="live"
						data-in={lab.id === "c" ? undefined : true}
					>
						<span className="me-site__place">{lab.place}</span>
						<span className="me-site__cloud">{lab.what}</span>
						<span className="me-site__status">
							<span className="me-site__dot" aria-hidden="true" />
							{lab.note}
						</span>
					</li>
				))}
			</ul>
			<div className="me-pairs">
				<span className="me-pair me-pair--fact">
					<span>Delft, 2015 · 245 trials over 220 hours</span>
					<span className="me-pair__light">4.27 µs</span>
				</span>
			</div>
		</div>
	);
}
