import { type Form, type FormId, formOf } from "./forms";
import { type Net, type Press, weave } from "./net";
import { type Fit, tailor } from "./tailor";

export const STEP: Record<FormId, number> = {
	ball: 0.04,
	saddle: 0.035,
	bagel: 0.045,
};

export const ROUGH = 1.6;

export const DRESSED = 0.995;

export interface Layout {
	form: FormId;
	fill: number;
	sewn: Press[];
	loose: Press | null;
}

export interface Fitted {
	form: Form;
	nets: Net[];
	fit: Fit;
	rough: boolean;
}

const LIMIT = 24;
const nets = new Map<string, Net>();

const keyOf = (form: FormId, fill: number, h: number, press: Press) =>
	[
		form,
		fill.toFixed(4),
		h.toFixed(4),
		...press.pin.map((v) => v.toFixed(6)),
		...press.warp.map((v) => v.toFixed(6)),
	].join("|");

export function netOf(form: FormId, fill: number, h: number, press: Press) {
	const key = keyOf(form, fill, h, press);
	let net = nets.get(key);

	if (net) {
		nets.delete(key);
		nets.set(key, net);

		return net;
	}

	net = weave(formOf(form), press, h, fill);
	nets.set(key, net);

	if (nets.size > LIMIT) {
		const oldest = nets.keys().next().value;

		if (oldest) nets.delete(oldest);
	}

	return net;
}

export function fitOf(layout: Layout, rough = false): Fitted {
	const form = formOf(layout.form);
	const h = STEP[layout.form] * (rough ? ROUGH : 1);
	const presses = layout.loose ? [...layout.sewn, layout.loose] : layout.sewn;
	const woven = presses.map((p) => netOf(layout.form, layout.fill, h, p));

	return { form, nets: woven, fit: tailor(form, woven), rough };
}
