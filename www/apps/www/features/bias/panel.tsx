import { FORMS, type FormId, formOf } from "./forms";
import { lean, type Preset } from "./story";
import { Swatch } from "./swatch";

export interface Reading {
	coverage: number;
	cloth: number;
	count: number;
}

export function Meters({
	reading,
	best,
	dressed,
}: {
	reading: Reading;
	best: number;
	dressed: boolean;
}) {
	const covered = reading.coverage * 100;

	return (
		<dl className="cb-meters">
			<div className="cb-meter" data-done={dressed || undefined}>
				<dt className="cb-label">Covered</dt>
				<dd className="cb-meter__value">
					{covered >= 99.95
						? "100"
						: covered >= 99
							? covered.toFixed(1)
							: Math.floor(covered)}
					%
				</dd>
			</div>
			<div className="cb-meter">
				<dt className="cb-label">Pieces</dt>
				<dd className="cb-meter__value">{reading.count}</dd>
				<dd className="cb-meter__note">
					<span className="cb-meter__long">fewest found </span>
					<span className="cb-meter__short">fewest </span>
					{best}
				</dd>
			</div>
			<div
				className="cb-meter"
				title="Leaning checks pack their threads closer, so a curved body takes more cloth than its own area."
			>
				<dt className="cb-label">Cloth</dt>
				<dd className="cb-meter__value">
					{reading.count ? `${reading.cloth.toFixed(2)}×` : "0"}
				</dd>
			</div>
		</dl>
	);
}

export function Forms({
	form,
	onChoose,
}: {
	form: FormId;
	onChoose: (id: FormId) => void;
}) {
	return (
		<fieldset className="cb-forms" aria-label="Form">
			{FORMS.map((id) => (
				<button
					key={id}
					type="button"
					className="cb-chip"
					aria-pressed={form === id}
					onClick={() => onChoose(id)}
				>
					{formOf(id).name}
				</button>
			))}
		</fieldset>
	);
}

interface SliderProps {
	value: number;
	onChange: (value: number) => void;
	onRough: (rough: boolean) => void;
}

export function Thread({ value, onChange, onRough }: SliderProps) {
	return (
		<label className="cb-slider">
			<span className="cb-label">Thread</span>
			<input
				type="range"
				min={0}
				max={0.9}
				step={0.01}
				value={value}
				aria-valuetext={
					value < 0.02
						? "no width, folds flat"
						: `jams at ${lean(value)} degrees`
				}
				onChange={(e) => onChange(Number(e.target.value))}
				onPointerDown={() => onRough(true)}
				onPointerUp={() => onRough(false)}
			/>
			<span className="cb-slider__value">
				<Swatch fill={value} />
				<span>{value < 0.02 ? "folds flat" : `jams at ${lean(value)}°`}</span>
			</span>
		</label>
	);
}

export function Grain({
	value,
	enabled,
	onChange,
	onRough,
}: SliderProps & { enabled: boolean }) {
	return (
		<label className="cb-slider" data-off={!enabled || undefined}>
			<span className="cb-label">Grain</span>
			<input
				type="range"
				min={-45}
				max={45}
				step={1}
				value={value}
				disabled={!enabled}
				onChange={(e) => onChange(Number(e.target.value))}
				onPointerDown={() => onRough(true)}
				onPointerUp={() => onRough(false)}
			/>
			<span className="cb-slider__value">
				<span>{enabled ? `turned ${value}°` : "pin a piece"}</span>
			</span>
		</label>
	);
}

interface ActionsProps {
	loose: boolean;
	sewn: number;
	onSew: () => void;
	onUnpick: () => void;
	onRestart: () => void;
}

export function Actions({
	loose,
	sewn,
	onSew,
	onUnpick,
	onRestart,
}: ActionsProps) {
	const empty = !loose && sewn === 0;

	return (
		<div className="cb-actions">
			<button
				type="button"
				className="cb-button"
				data-main
				disabled={!loose}
				onClick={onSew}
			>
				Sew on
			</button>
			<button
				type="button"
				className="cb-button"
				disabled={empty}
				onClick={onUnpick}
			>
				Unpick
			</button>
			<button
				type="button"
				className="cb-button"
				disabled={empty}
				onClick={onRestart}
			>
				Start over
			</button>
		</div>
	);
}

export function Presets({
	presets,
	active,
	onLoad,
}: {
	presets: Preset[];
	active: string | null;
	onLoad: (preset: Preset) => void;
}) {
	return (
		<fieldset className="cb-presets" aria-label="Known cuts">
			<span className="cb-label">Known cuts</span>
			{presets.map((preset) => (
				<button
					key={preset.id}
					type="button"
					className="cb-chip"
					aria-pressed={active === preset.id}
					onClick={() => onLoad(preset)}
				>
					{preset.label}
				</button>
			))}
		</fieldset>
	);
}
