import type { PartId } from "./model";

export interface Instrument {
	id: string;
	name: string;
	short: string;
	job: string;
	off: string | null;
	part: PartId;
}

export const instruments: Instrument[] = [
	{
		id: "PPS",
		name: "Photopolarimeter",
		short: "Polarimeter",
		job: "Light and polarization at eight wavelengths",
		off: "1980-01-29",
		part: "scan",
	},
	{
		id: "ISS",
		name: "Imaging Science",
		short: "Cameras",
		job: "Two cameras, 200 mm and 1500 mm",
		off: "1990-02-14",
		part: "scan",
	},
	{
		id: "IRIS",
		name: "Infrared Interferometer",
		short: "Infrared",
		job: "Heat and chemistry of planets",
		off: "1998-06-03",
		part: "scan",
	},
	{
		id: "PLS",
		name: "Plasma Science",
		short: "Plasma",
		job: "Solar wind speed and density",
		off: "2007-02-01",
		part: "pls",
	},
	{
		id: "PRA",
		name: "Planetary Radio Astronomy",
		short: "Radio",
		job: "Radio emissions, 20 kHz to 40 MHz",
		off: "2008-01-15",
		part: "pws",
	},
	{
		id: "UVS",
		name: "Ultraviolet Spectrometer",
		short: "Ultraviolet",
		job: "Atmospheres in far ultraviolet",
		off: "2016-04-19",
		part: "scan",
	},
	{
		id: "CRS",
		name: "Cosmic Ray Subsystem",
		short: "Cosmic rays",
		job: "Electrons and nuclei, up to 500 MeV",
		off: "2025-02-25",
		part: "crs",
	},
	{
		id: "LECP",
		name: "Low-Energy Charged Particles",
		short: "Particles",
		job: "Ions and electrons, stepping in a circle",
		off: "2026-04-17",
		part: "lecp",
	},
	{
		id: "MAG",
		name: "Magnetometer",
		short: "Magnetometer",
		job: "Magnetic fields, from a 13 m boom",
		off: null,
		part: "mag",
	},
	{
		id: "PWS",
		name: "Plasma Wave",
		short: "Plasma waves",
		job: "Plasma density, 10 Hz to 56 kHz",
		off: null,
		part: "pws",
	},
];

export interface Moment {
	date: string;
	label: string;
	approx?: boolean;
}

export const moments: Moment[] = [
	{ date: "1977-09-05", label: "Launch" },
	{ date: "1979-03-05", label: "Jupiter" },
	{ date: "1980-11-12", label: "Saturn" },
	{ date: "1990-02-14", label: "Pale Blue Dot" },
	{ date: "2004-12-16", label: "Termination shock" },
	{ date: "2012-08-25", label: "Interstellar space" },
	{ date: "2023-11-14", label: "Chip fails" },
	{ date: "2030-07-01", label: "Too little power for science", approx: true },
];

export const LAUNCH_YEAR = 1977 + (248 - 1) / 365;
export const END_YEAR = 2032;
export const LAUNCH_WATTS = 470;
const WATTS_2023 = 225;
const TAU = (2023.5 - LAUNCH_YEAR) / Math.log(LAUNCH_WATTS / WATTS_2023);

export const watts = (year: number) =>
	LAUNCH_WATTS * Math.exp(-Math.max(0, year - LAUNCH_YEAR) / TAU);

export const wattsPerYear = (year: number) => watts(year) / TAU;

export const yearOf = (iso: string) => {
	const t = Date.parse(`${iso}T00:00:00Z`);
	const y = new Date(t).getUTCFullYear();
	const start = Date.UTC(y, 0, 1);
	const end = Date.UTC(y + 1, 0, 1);

	return y + (t - start) / (end - start);
};

export const yearNow = (ms: number) => {
	const y = new Date(ms).getUTCFullYear();
	const start = Date.UTC(y, 0, 1);
	const end = Date.UTC(y + 1, 0, 1);

	return y + (ms - start) / (end - start);
};

export function offParts(year: number): Set<PartId> {
	const out = new Set<PartId>();
	const byPart = new Map<PartId, boolean>();

	for (const i of instruments) {
		const on = i.off === null || yearOf(i.off) > year;

		byPart.set(i.part, (byPart.get(i.part) ?? false) || on);
	}

	for (const [part, on] of byPart) if (!on) out.add(part);

	return out;
}

export const formatDate = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

export const formatMoment = (m: Moment) =>
	m.approx ? `Around ${m.date.slice(0, 4)}` : formatDate(m.date);

export interface Milestone {
	year: number;
	when: string;
	label: string;
}

export const milestones: Milestone[] = [
	...moments.map((m) => ({
		year: yearOf(m.date),
		when: formatMoment(m),
		label: m.label,
	})),
	...instruments.flatMap((i) =>
		i.off
			? [
					{
						year: yearOf(i.off),
						when: formatDate(i.off),
						label: `${i.id} switched off`,
					},
				]
			: [],
	),
].sort((a, b) => a.year - b.year);

export function nearest<T>(
	list: readonly T[],
	year: number,
	at: (t: T) => number,
) {
	let best = 0;

	for (let i = 1; i < list.length; i++)
		if (Math.abs(at(list[i]) - year) < Math.abs(at(list[best]) - year))
			best = i;

	return best;
}
