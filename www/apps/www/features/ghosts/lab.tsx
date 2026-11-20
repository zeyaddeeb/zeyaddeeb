"use client";

import { useState } from "react";
import { RiggedCurve, SwitchChart } from "./charts";
import { CoinCard } from "./coin";
import {
	agreementTitle,
	COINS,
	checkpoint,
	detail,
	family,
	picks,
	readings,
	STUDY,
	signed,
	twinDetail,
	twinTitle,
} from "./model";
import { Square } from "./square";
import "./lab.css";
import "./phone.css";

const PICKS = picks(COINS);

const SHORT: Record<string, string> = {
	qwen: "Qwen 3B",
	llama: "Llama 3B",
	olmo2: "OLMo 2 1B",
	olmo3i: "OLMo 3 Instruct",
	olmo3t: "OLMo 3 Think",
};

const TABS = [
	{ id: "coin", label: "Coin" },
	{ id: "rigged", label: "Looks rigged" },
	{ id: "switch", label: "Expects a switch" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const BANDS = [
	{ long: "4 or fewer switches", short: "0–4 switches" },
	{ long: "5 or 6", short: "5–6" },
	{ long: "7 or 8", short: "7–8" },
	{ long: "9 or 10", short: "9–10" },
	{ long: "11 or more", short: "11+" },
];

export function GhostsLab() {
	const [familyId, setFamilyId] = useState("qwen");
	const [stage, setStage] = useState(0);
	const [zorp, setZorp] = useState(false);
	const [selected, setSelected] = useState(PICKS.streaky);
	const [pointed, setPointed] = useState(-1);
	const [tab, setTab] = useState<Tab>("coin");

	const fam = family(familyId);
	const at = Math.min(stage, fam.path.length - 1);
	const key = fam.path[at] ?? fam.path[0] ?? "";
	const c = checkpoint(key);
	const r = readings(key);
	const steps = fam.path.map(checkpoint);
	const base = at > 0 ? (steps[0] ?? null) : null;
	const shown = pointed >= 0 ? pointed : selected;
	const coin = COINS[shown] ?? COINS[0];
	const slope = zorp ? c.twinExpects : (c.agree[0] ?? 0);
	const [lo, hi] = [c.agree[1] ?? 0, c.agree[2] ?? 0];

	const pick = (which: "streaky" | "typical" | "alternating" | "any") => {
		setPointed(-1);
		setSelected(
			which === "any" ? Math.floor(Math.random() * COINS.length) : PICKS[which],
		);
	};

	if (!coin) return null;

	return (
		<div className="gh">
			<div className="gh-families" role="tablist" aria-label="Model family">
				{STUDY.families.map((f) => (
					<button
						key={f.id}
						type="button"
						role="tab"
						aria-selected={f.id === familyId}
						className="gh-plate"
						onClick={() => setFamilyId(f.id)}
					>
						<span className="gh-plate__long">{f.label}</span>
						<span className="gh-plate__short">{SHORT[f.id] ?? f.label}</span>
					</button>
				))}
			</div>

			<div className="gh-words">
				<p className="gh-eyebrow">
					<span>{c.label}</span>
					<span>{zorp ? "zorp or blarg" : "rigged or fair"}</span>
				</p>
				<h2 className="gh-title">
					{zorp ? twinTitle(c) : agreementTitle(c.agree[0] ?? 0)}
				</h2>
				<p className="gh-detail">{zorp ? twinDetail(c) : detail(c)}</p>
				<p className="gh-score" aria-live="polite">
					<span className="gh-score__value">{signed(slope)}</span>
					<span className="gh-score__label">
						{zorp
							? "zorp answers vs predictions"
							: `agreement, 95% interval ${signed(lo)} to ${signed(hi)}`}
					</span>
					<span className="gh-score__short" aria-hidden="true">
						{zorp ? "zorp vs predictions" : "agreement"}
					</span>
				</p>

				<ol className="gh-steps" aria-label="Training stage">
					{steps.map((s, i) => (
						<li key={s.label}>
							<button
								type="button"
								className="gh-step"
								aria-pressed={i === at}
								onClick={() => setStage(i)}
							>
								<span className="gh-step__name">{s.stage}</span>
								<span className="gh-step__value">
									{signed(s.agree[0] ?? 0)}
								</span>
							</button>
						</li>
					))}
				</ol>

				<button
					type="button"
					className="gh-zorp"
					aria-pressed={zorp}
					onClick={() => setZorp(!zorp)}
				>
					<span className="gh-zorp__box" aria-hidden="true" />
					Ask “zorp or blarg?” instead
				</button>
			</div>

			<div className="gh-plot">
				<span className="gh-axis gh-axis--top">expects rigged</span>
				<span className="gh-axis gh-axis--bottom">expects fair</span>
				<Square
					coins={COINS}
					xs={zorp ? r.twin : r.says}
					ys={r.expects}
					slope={slope}
					selected={selected}
					pointed={pointed}
					label={`${c.label}: 600 fair coins. Across, what it ${zorp ? "answers to zorp or blarg" : "says"}; up, what its own predictions imply. Correlation ${signed(slope)}.`}
					onPoint={setPointed}
					onSelect={(i) => {
						setSelected(i);
						setTab("coin");
					}}
				/>
				<span className="gh-axis gh-axis--left">
					{zorp ? "says blarg" : "says fair"}
				</span>
				<span className="gh-axis gh-axis--right">
					{zorp ? "says zorp" : "says rigged"}
				</span>
				<ul className="gh-legend" aria-label="Dot color">
					{BANDS.map((b, i) => (
						<li key={b.long} data-band={i}>
							<span className="gh-legend__dot" aria-hidden="true" />
							<span className="gh-legend__long">{b.long}</span>
							<span className="gh-legend__short" aria-hidden="true">
								{b.short}
							</span>
						</li>
					))}
				</ul>
			</div>

			<div className="gh-side" data-tab={tab}>
				<div className="gh-tabs" role="tablist" aria-label="Panel">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							role="tab"
							aria-selected={t.id === tab}
							className="gh-tab"
							onClick={() => setTab(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>
				<section className="gh-panel" data-panel="coin">
					<CoinCard
						coin={coin}
						says={r.saysRank[coin.index] ?? 0}
						expects={r.expectsRank[coin.index] ?? 0}
						twin={r.twinRank[coin.index] ?? 0}
						zorp={zorp}
						usable={c.usable > 0}
						onPick={pick}
					/>
				</section>
				<section className="gh-panel" data-panel="rigged">
					<RiggedCurve current={c} base={base} />
				</section>
				<section className="gh-panel" data-panel="switch">
					<SwitchChart steps={steps} current={at} />
				</section>
			</div>
		</div>
	);
}
