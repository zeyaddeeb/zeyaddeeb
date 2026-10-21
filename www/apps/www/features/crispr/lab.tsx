"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import {
	mutate,
	type Only,
	reachable,
	VARIANTS,
	type Verdict,
} from "./alleles";
import {
	appliedSeq,
	type BasePlan,
	baseCorrect,
	baseSites,
	EDITOR_LABEL,
	type Editor,
	NICK_HI,
	NICK_LO,
	type NickBand,
	PAM_LABEL,
	type PamClass,
	type PrimePlan,
	primeOptions,
	primeWrite,
	REACH,
	type Strategy,
	secondNicks,
	WINDOW_HI,
	WINDOW_LO,
} from "./editing";
import { FACTS, LEAK, MATCHED, SHARES } from "./facts";
import { LOCUS } from "./locus-data";
import { type Beat, Molecule } from "./molecule";
import { likeliest, share, spectrum } from "./repair";
import { type Marker, type Pick, Tape } from "./tape";
import "./crispr.css";
import "./phone.css";

const BEATS: { beat: Beat; label: string; short: string }[] = [
	{ beat: "read", label: "Look at it", short: "Look" },
	{ beat: "latch", label: "Latch on", short: "Latch" },
	{ beat: "cut", label: "Cut", short: "Cut" },
	{ beat: "mend", label: "Let it mend", short: "Mend" },
];

const beatLabel = (long: string, short: string) => (
	<>
		<span className="cr-beat__long">{long}</span>
		<span className="cr-beat__short">{short}</span>
	</>
);

const STRATEGIES: {
	id: Strategy;
	name: string;
	mechanism: string;
}[] = [
	{ id: "cut", name: "Cut it out", mechanism: "double-strand break" },
	{ id: "rewrite", name: "Rewrite the letter", mechanism: "a nick, no break" },
	{ id: "write", name: "Write it back", mechanism: "a nick, no break" },
];

const CALLS: Record<Only, string> = {
	both: "Cuts both copies. The tumor loses KRAS, and so does every healthy cell the editor reaches.",
	mutant:
		"Cuts the tumor copy only. The healthy copy has no PAM here, so Cas9 cannot open it.",
	normal:
		"Cuts the healthy copy only. The mutation destroyed the PAM, so this guide spares the cancer.",
	neither: "Cuts neither copy. There is no PAM here on either sequence.",
};

const EDIT_CALLS = {
	rewrite: {
		yes: "Rewrites the one changed letter back to healthy — no break to scramble, no harm to the healthy copy.",
		none: "This pairing finds no site here. The letter is reachable — just not with this editor and this PAM.",
		no: "A base editor cannot make this change: it swaps only transitions, and this mutation is a transversion.",
	},
	write: {
		yes: "Writes the exact healthy letter back in place, with no double-strand break at all.",
		no: "No nicking site lands close enough to write this position.",
	},
} as const;

const CUT_ARIA: Record<Only, string> = {
	both: "cuts both copies",
	mutant: "cuts the tumor copy",
	normal: "cuts the healthy copy",
	neither: "cuts neither copy",
};

const EDITOR_PICK: { id: Editor; label: string; short: string }[] = [
	{ id: "abe", label: "Adenine editor", short: "ABE" },
	{ id: "cbe", label: "Cytosine editor", short: "CBE" },
];

const PAM_PICK: { id: PamClass; label: string; short: string }[] = [
	{ id: "ngg", label: "SpCas9 (NGG)", short: "NGG" },
	{ id: "ng", label: "Flexible (NG)", short: "NG" },
];

const NICK_SAID: Record<NickBand, string> = {
	close: `under ${NICK_LO}: close enough on opposite strands to read as a break`,
	good: `inside the ${NICK_LO}\u2013${NICK_HI} the authors recommend`,
	far: `past ${NICK_HI}: outside the band they tested`,
};

const NICK_PICK: { id: boolean; label: string; short: string }[] = [
	{ id: false, label: "One nick", short: "One" },
	{ id: true, label: "Nick both strands", short: "Both" },
];

const SAMPLES = [
	...Object.values(CALLS),
	...Object.values(EDIT_CALLS).flatMap((pair) => Object.values(pair)),
];

const NO_BASE_EDIT =
	"No edit — a base editor only swaps A↔G and C↔T, and this change is neither.";

const baseSaid = (restores: boolean, editor: Editor) =>
	`${restores ? "Writes the healthy letter back" : "Reaches the letter"} with an ${EDITOR_LABEL[editor]}.`;

const baseVerdict = (plan: BasePlan): string =>
	plan.possible
		? baseSaid(Boolean(plan.restores), plan.editor ?? "abe")
		: NO_BASE_EDIT;

const PRIME_SAID = {
	yes: "Writes the exact healthy letter back, with no double-strand break at all.",
	no: "No nick lands close enough to write here.",
} as const;

const primeVerdict = (plan: PrimePlan): string =>
	PRIME_SAID[plan.possible ? "yes" : "no"];

const EDITORS: Editor[] = ["abe", "cbe"];

const STRAT_SAID: Record<Strategy, readonly string[]> = {
	cut: ["Shares the PAM with the healthy copy, and the break scrambles."],
	rewrite: [
		NO_BASE_EDIT,
		...EDITORS.flatMap((editor) => [
			baseSaid(true, editor),
			baseSaid(false, editor),
		]),
	],
	write: Object.values(PRIME_SAID),
};

const chosenStart = (verdicts: Verdict[]) => {
	const touching = verdicts.filter((verdict) => verdict.holds);

	if (!touching.length) return 0;

	const best =
		touching.find((verdict) => verdict.only === "mutant") ??
		touching.find(
			(verdict) => verdict.only === "both" && (verdict.fromPam ?? 99) <= 3,
		) ??
		touching[0];

	return verdicts.indexOf(best);
};

function pamLine(pam: string, ok: boolean) {
	return (
		<span className="cr-pam" data-ok={ok}>
			{[...pam].map((base, index) => (
				<span key={`${base}-${index}`} data-base={base}>
					{base}
				</span>
			))}
		</span>
	);
}

export function CrisprLab() {
	const [variantId, setVariantId] = useState(VARIANTS[0].id);
	const [strategy, setStrategy] = useState<Strategy>("cut");
	const [beat, setBeat] = useState<Beat>("read");
	const [unrolled, setUnrolled] = useState(false);

	const variant = useMemo(
		() => VARIANTS.find((item) => item.id === variantId) ?? VARIANTS[0],
		[variantId],
	);

	const normal = LOCUS.window.seq;
	const mutant = useMemo(() => mutate(normal, variant), [normal, variant]);
	const verdicts = useMemo(
		() => reachable(mutant, normal, variant),
		[mutant, normal, variant],
	);

	const base = useMemo(() => baseCorrect(mutant, variant), [mutant, variant]);
	const prime = useMemo(() => primeWrite(normal, variant), [normal, variant]);

	const [editor, setEditor] = useState<Editor>("abe");
	const [pamClass, setPamClass] = useState<PamClass>("ng");

	const baseList = useMemo(
		() => baseSites(mutant, variant, editor, pamClass),
		[mutant, variant, editor, pamClass],
	);
	const primeList = useMemo(
		() => primeOptions(normal, variant),
		[normal, variant],
	);

	const [chosen, setChosen] = useState(() => chosenStart(verdicts));
	const [baseChosen, setBaseChosen] = useState(0);
	const [primeChosen, setPrimeChosen] = useState(0);
	const [bothStrands, setBothStrands] = useState(false);
	const [secondChosen, setSecondChosen] = useState(0);

	const picked = verdicts[Math.min(chosen, verdicts.length - 1)];
	const baseAt = baseList.length
		? Math.min(baseChosen, baseList.length - 1)
		: 0;
	const primeAt = primeList.length
		? Math.min(primeChosen, primeList.length - 1)
		: 0;
	const basePick = baseList[baseAt];
	const primePick = primeList[primeAt];

	const secondList = useMemo(
		() => (primePick ? secondNicks(normal, primePick.guide) : []),
		[normal, primePick],
	);
	const secondAt = secondList.length
		? Math.min(secondChosen, secondList.length - 1)
		: 0;
	const secondPick = secondList[secondAt];
	const nicking = strategy === "write" && bothStrands && secondPick;
	const measured =
		picked && picked.only === "both" && picked.holds
			? LEAK[variant.id]
			: undefined;

	const mending = useMemo(
		() => (picked ? spectrum(mutant, picked.guide.cut) : null),
		[mutant, picked],
	);
	const outcomes = mending ? likeliest(mending, 3) : [];
	const best = outcomes[0];
	const removed: readonly [number, number] | null =
		strategy === "cut" && beat === "mend" && best
			? [best.leftEnd + 1, best.rightEnd]
			: null;

	const editGuide =
		strategy === "rewrite"
			? (basePick?.guide ?? null)
			: strategy === "write"
				? (primePick?.guide ?? null)
				: null;
	const stageSeq =
		strategy === "rewrite"
			? basePick
				? appliedSeq(mutant, basePick)
				: mutant
			: strategy === "write"
				? normal
				: mutant;
	const stageGuide =
		strategy === "cut" ? (picked ? picked.guide : null) : editGuide;
	const stageBeat: Beat = strategy === "cut" ? beat : "latch";
	const stageFocus =
		strategy === "cut"
			? picked
				? (Math.min(picked.guide.start, picked.guide.pamStart) +
						Math.max(picked.guide.end, picked.guide.pamStart + 2)) /
					2
				: LOCUS.codon12
			: strategy === "rewrite"
				? basePick
					? (basePick.window[0] + basePick.window[1]) / 2
					: variant.offset
				: primePick
					? primePick.nick
					: variant.offset;

	const picks: Pick[] = useMemo(() => {
		if (strategy === "cut")
			return verdicts.map((verdict) => ({
				guide: verdict.guide,
				at: verdict.guide.cut,
				only: verdict.only,
				window: null,
				said: `cut ${verdict.guide.cut}, ${CUT_ARIA[verdict.only]}`,
			}));

		if (strategy === "rewrite")
			return baseList.map((option) => ({
				guide: option.guide,
				at: Math.round((option.window[0] + option.window[1]) / 2),
				only: null,
				window: option.window,
				said: `window ${option.window[0]} to ${option.window[1]}, ${option.bystanders.length} bystanders`,
			}));

		if (bothStrands)
			return secondList.map((option) => ({
				guide: option.guide,
				at: option.nick,
				only: null,
				window: null,
				said: `second nick ${option.nick}, ${option.distance} letters from the first, ${NICK_SAID[option.band]}`,
			}));

		return primeList.map((option) => ({
			guide: option.guide,
			at: option.nick,
			only: null,
			window: null,
			said: `nick ${option.nick}, ${option.distance} letters from the mutation`,
		}));
	}, [strategy, verdicts, baseList, primeList, secondList, bothStrands]);

	const tapeChosen =
		strategy === "cut"
			? chosen
			: strategy === "rewrite"
				? baseChosen
				: bothStrands
					? secondChosen
					: primeChosen;
	const onTapeChoose =
		strategy === "cut"
			? setChosen
			: strategy === "rewrite"
				? setBaseChosen
				: bothStrands
					? setSecondChosen
					: setPrimeChosen;
	const marker: Marker =
		strategy === "cut"
			? "cut"
			: strategy === "rewrite"
				? "window"
				: bothStrands
					? "second"
					: "nick";
	const tapeLabel =
		strategy === "cut"
			? "Cut site along KRAS"
			: strategy === "rewrite"
				? "Editing window along KRAS"
				: bothStrands
					? "Second nicking site along KRAS"
					: "Nicking site along KRAS";
	const anchor = nicking && primePick ? primePick.nick : null;
	const center =
		nicking && primePick && secondPick
			? (primePick.nick + secondPick.nick) / 2
			: null;

	const pick = (id: string) => {
		const next = VARIANTS.find((item) => item.id === id) ?? VARIANTS[0];
		const fresh = reachable(mutate(normal, next), normal, next);

		setVariantId(id);
		setChosen(chosenStart(fresh));
		setBeat("read");
	};

	const strategyVerdict: Record<Strategy, string> = {
		cut: STRAT_SAID.cut[0],
		rewrite: baseVerdict(base),
		write: primeVerdict(prime),
	};

	const headline =
		strategy === "cut"
			? picked
				? CALLS[picked.only]
				: CALLS.neither
			: strategy === "rewrite"
				? base.possible
					? basePick
						? EDIT_CALLS.rewrite.yes
						: EDIT_CALLS.rewrite.none
					: EDIT_CALLS.rewrite.no
				: EDIT_CALLS.write[primePick ? "yes" : "no"];

	return (
		<div
			className="cr"
			data-beat={beat}
			data-only={picked?.only}
			data-strategy={strategy}
		>
			<header className="cr-head">
				<p className="cr-eyebrow">
					{LOCUS.gene} · chr{LOCUS.chromosome} · {LOCUS.assembly} · codon{" "}
					{variant.codon}
				</p>
				<p className="cr-call">
					<ReservedText text={headline} samples={SAMPLES} />
				</p>
			</header>

			<div className="cr-genotype">
				<p className="cr-genotype__label">
					The tumor carries{" "}
					<span className="cr-genotype__hint">share of KRAS-mutant CRC</span>
				</p>
				<div className="cr-chips">
					{VARIANTS.map((item) => (
						<button
							key={item.id}
							type="button"
							className="cr-chip"
							data-on={item.id === variant.id}
							onClick={() => pick(item.id)}
						>
							<span className="cr-chip__name">{item.label}</span>
							<span className="cr-chip__aa">
								{item.was} → {item.now}
							</span>
							<span className="cr-chip__share">{SHARES[item.id]}%</span>
						</button>
					))}
				</div>
			</div>

			<div className="cr-strategy">
				{STRATEGIES.map((item) => (
					<button
						key={item.id}
						type="button"
						className="cr-strat"
						data-on={strategy === item.id}
						data-id={item.id}
						onClick={() => setStrategy(item.id)}
					>
						<span className="cr-strat__name">{item.name}</span>
						<span className="cr-strat__mech">{item.mechanism}</span>
						<span className="cr-strat__said">
							<ReservedText
								text={strategyVerdict[item.id]}
								samples={STRAT_SAID[item.id]}
							/>
						</span>
					</button>
				))}
			</div>

			<div className="cr-stage">
				<Molecule
					seq={stageSeq}
					guide={stageGuide}
					beat={stageBeat}
					removed={removed}
					focus={stageFocus}
					unrolled={unrolled}
				/>
				<Tape
					mutant={mutant}
					normal={normal}
					variant={variant}
					picks={picks}
					chosen={tapeChosen}
					onChoose={onTapeChoose}
					marker={marker}
					label={tapeLabel}
					anchor={anchor}
					center={center}
				/>
			</div>

			<div className="cr-beats">
				{strategy === "cut"
					? BEATS.map((item) => (
							<button
								key={item.beat}
								type="button"
								className="cr-beat"
								data-on={beat === item.beat}
								onClick={() => setBeat(item.beat)}
							>
								{beatLabel(item.label, item.short)}
							</button>
						))
					: null}

				{strategy === "rewrite" ? (
					<>
						{EDITOR_PICK.map((item) => (
							<button
								key={item.id}
								type="button"
								className="cr-beat cr-beat--set"
								data-on={editor === item.id}
								onClick={() => setEditor(item.id)}
							>
								{beatLabel(item.label, item.short)}
							</button>
						))}
						{PAM_PICK.map((item, index) => (
							<button
								key={item.id}
								type="button"
								className={`cr-beat cr-beat--set${index === 0 ? " cr-beat--split" : ""}`}
								data-on={pamClass === item.id}
								onClick={() => setPamClass(item.id)}
							>
								{beatLabel(item.label, item.short)}
							</button>
						))}
					</>
				) : null}

				{strategy === "write" ? (
					<>
						{NICK_PICK.map((item) => (
							<button
								key={item.short}
								type="button"
								className="cr-beat cr-beat--set"
								data-on={bothStrands === item.id}
								onClick={() => setBothStrands(item.id)}
							>
								{beatLabel(item.label, item.short)}
							</button>
						))}
					</>
				) : null}
				<button
					type="button"
					className="cr-beat cr-beat--aside"
					data-on={unrolled}
					onClick={() => setUnrolled((now) => !now)}
				>
					{unrolled
						? beatLabel("Coil it back", "Coil")
						: beatLabel("Unroll it", "Unroll")}
				</button>
			</div>

			{strategy === "cut" ? (
				beat === "mend" && mending ? (
					<section className="cr-panel" aria-label="What the cell writes back">
						<h3 className="cr-panel__title">What the cell writes back</h3>

						<div className="cr-panel__body">
							<p className="cr-measured">
								<span className="cr-measured__value">
									{Math.round(mending.outOfFrame)}%
								</span>
								<span>
									of the predicted repairs shift the reading frame, which is
									what breaks the gene. The rest leave it readable.
								</span>
							</p>

							<ol className="cr-outcomes">
								{outcomes.map((pattern) => (
									<li
										key={`${pattern.leftStart}:${pattern.rightStart}`}
										data-shifts={pattern.shifts}
									>
										<span className="cr-outcomes__bar">
											<span
												className="cr-outcomes__fill"
												style={
													{
														"--fill": `${Math.round(share(mending, pattern) * 100)}%`,
													} as CSSProperties
												}
											/>
										</span>
										<span className="cr-outcomes__said">
											<strong>−{pattern.deletion} letters</strong> on the repeat{" "}
											<code>{pattern.homology}</code>
										</span>
										<span className="cr-outcomes__frame">
											{pattern.shifts ? "frame shifts" : "stays in frame"}
										</span>
									</li>
								))}
							</ol>
						</div>

						<p className="cr-panel__note">
							Cas9 does not write the replacement. Short repeats either side of
							the cut pair up and the stretch between them is lost — a spread of
							outcomes, not one answer.
						</p>
					</section>
				) : (
					<section
						className="cr-panel"
						aria-label="Telling the two copies apart"
					>
						<h3 className="cr-panel__title">Telling the two copies apart</h3>

						<div className="cr-panel__body">
							{picked ? (
								<dl className="cr-compare">
									<div className="cr-compare__row" data-side="mutant">
										<dt>Tumor copy</dt>
										<dd>
											{pamLine(picked.mutant.pam, picked.mutant.pamOk)}
											<span className="cr-compare__said">
												{picked.mutant.pamOk
													? picked.mutant.mismatches.length === 0
														? "PAM intact, all 20 letters match"
														: `PAM intact, ${picked.mutant.mismatches.length} letter off at ${picked.mutant.mismatches.join(", ")} from the PAM`
													: "no PAM — Cas9 cannot open this copy"}
											</span>
										</dd>
									</div>
									<div className="cr-compare__row" data-side="normal">
										<dt>Healthy copy</dt>
										<dd>
											{pamLine(picked.normal.pam, picked.normal.pamOk)}
											<span className="cr-compare__said">
												{picked.normal.pamOk
													? picked.normal.mismatches.length === 0
														? "PAM intact, all 20 letters match"
														: `PAM intact, ${picked.normal.mismatches.length} letter off at ${picked.normal.mismatches.join(", ")} from the PAM`
													: "no PAM — Cas9 cannot open this copy"}
											</span>
										</dd>
									</div>
								</dl>
							) : null}

							{measured ? (
								<p className="cr-measured">
									<span className="cr-measured__value">{measured.leak}%</span>
									<span>
										of healthy copies were cut anyway when {measured.guide} was
										measured in cells, against {MATCHED}% for a guide that
										matches the healthy copy exactly.
									</span>
								</p>
							) : null}
						</div>

						<p className="cr-panel__note">
							{picked?.onPam
								? "The changed letter sits inside the PAM itself. One copy can be opened and the other cannot — but here it is the healthy copy that carries the PAM."
								: picked?.fromPam
									? `The only difference sits ${picked.fromPam} ${picked.fromPam === 1 ? "letter" : "letters"} from the PAM. Letters 2 to 8 are the fussiest stretch; letter 1, hard against the PAM, is not.`
									: "This guide never covers the changed letter, so it reads both copies the same way."}
						</p>
					</section>
				)
			) : strategy === "rewrite" ? (
				<section className="cr-panel" aria-label="Rewriting the letter">
					<h3 className="cr-panel__title">Rewriting the letter</h3>

					<div className="cr-panel__body">
						{basePick ? (
							<>
								<p className="cr-edit">
									An <strong>{EDITOR_LABEL[editor]}</strong> parks on the strand
									and swaps a single{" "}
									<code>
										{basePick.target.from}→{basePick.target.to}
									</code>{" "}
									at codon {variant.codon}, inside a narrow window — letters{" "}
									{WINDOW_LO}–{WINDOW_HI} from the PAM-distal end.
								</p>

								<dl className="cr-spec">
									<div className="cr-spec__row">
										<dt>Site</dt>
										<dd>
											{baseAt + 1} of {baseList.length} — drag the tape
										</dd>
									</div>
									<div className="cr-spec__row">
										<dt>Bystanders</dt>
										<dd>
											{basePick.bystanders.length === 0
												? "none in the window"
												: `${basePick.bystanders.length} other letter${basePick.bystanders.length === 1 ? "" : "s"} in range`}
										</dd>
									</div>
									<div className="cr-spec__row">
										<dt>Reading frame</dt>
										<dd>
											{basePick.restores
												? "the exon translates back to wild-type KRAS"
												: "the product shifts away from wild-type"}
										</dd>
									</div>
								</dl>
							</>
						) : base.possible ? (
							<p className="cr-edit">
								No site with <strong>{PAM_LABEL[pamClass]}</strong> and an{" "}
								<strong>{EDITOR_LABEL[editor]}</strong> puts this letter in the
								window. Codon 12 needs {PAM_LABEL[base.pam ?? "ng"]} and an{" "}
								{EDITOR_LABEL[base.editor ?? "abe"]}.
							</p>
						) : (
							<p className="cr-edit">
								This variant is a transversion — {variant.was}→{variant.now}{" "}
								rides on a <code>G→T</code> change. Base editors run only
								transitions, A↔G and C↔T, so none can reach it. The letter is in
								range; the chemistry is not.
							</p>
						)}
					</div>

					<p className="cr-panel__note">
						Base editing (Komor 2016; Gaudelli 2017) trades the scissors for a
						tethered deaminase. No break means no repair lottery.
					</p>
				</section>
			) : (
				<section className="cr-panel" aria-label="Writing it back">
					<h3 className="cr-panel__title">Writing it back</h3>

					<div className="cr-panel__body">
						{primePick ? (
							<>
								<p className="cr-edit">
									{nicking && secondPick ? (
										<>
											Nicking the other strand too raises editing{" "}
											<strong>{FACTS.secondNick.value}</strong> — but two nicks
											close together on opposite strands stop being nicks and
											become the break you came here to avoid.
										</>
									) : (
										<>
											Prime editing nicks one strand{" "}
											<strong>
												{primePick.distance} letter
												{primePick.distance === 1 ? "" : "s"}
											</strong>{" "}
											from the mutation and copies a new{" "}
											<code>
												{variant.to}→{variant.from}
											</code>{" "}
											off an attached template — no break, no donor, no
											bystander window.
										</>
									)}
								</p>

								<dl className="cr-spec">
									{nicking && secondPick ? (
										<>
											<div className="cr-spec__row">
												<dt>Second nick</dt>
												<dd>
													{secondAt + 1} of {secondList.length} — drag the tape
												</dd>
											</div>
											<div
												className="cr-spec__row"
												data-warn={secondPick.band === "close"}
											>
												<dt>Apart</dt>
												<dd>
													{secondPick.distance} letters —{" "}
													{NICK_SAID[secondPick.band]}
												</dd>
											</div>
											<div className="cr-spec__row">
												<dt>Cost</dt>
												<dd>
													{FACTS.nickTooClose.value} indels even at the best
													placement
												</dd>
											</div>
										</>
									) : (
										<>
											<div className="cr-spec__row">
												<dt>Nicking site</dt>
												<dd>
													{primeAt + 1} of {primeList.length} within {REACH}{" "}
													letters — drag the tape
												</dd>
											</div>
											<div className="cr-spec__row">
												<dt>Writes</dt>
												<dd>the exact wild-type codon, any substitution</dd>
											</div>
											<div className="cr-spec__row">
												<dt>The wall</dt>
												<dd>delivery and efficiency, not target design</dd>
											</div>
										</>
									)}
								</dl>
							</>
						) : (
							<p className="cr-edit">
								No nicking site lands within {REACH} letters of this position.
							</p>
						)}
					</div>

					<p className="cr-panel__note">
						Prime editing (Anzalone 2019) writes any of the twelve substitutions
						with no break. The limit now is delivery, not design.
					</p>
				</section>
			)}

			<footer className="cr-ledger">
				<span>
					{verdicts.filter((v) => v.holds && v.only === "mutant").length} of{" "}
					{verdicts.filter((v) => v.holds).length} guides over the mutation cut
					the tumor copy alone
				</span>
				<span className="cr-ledger__source">
					{LOCUS.gene} {LOCUS.transcript} · Ensembl {LOCUS.release} ·{" "}
					{LOCUS.window.seq.length} bp read on the coding strand
				</span>
			</footer>
		</div>
	);
}
