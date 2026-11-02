export type SiteId = "gcp-us-west1" | "gcp-us-east4" | "aws-us-east-1";

export interface Site {
	id: SiteId;
	place: string;
	short: string;
	tag: string;
	cloud: string;
	lat: number;
	lon: number;
	spreadKm: number;
}

export const SITES: readonly Site[] = [
	{
		id: "gcp-us-west1",
		place: "The Dalles, Oregon",
		short: "The Dalles",
		tag: "Oregon",
		cloud: "GKE us-west1",
		lat: 45.6318,
		lon: -121.2014,
		spreadKm: 5,
	},
	{
		id: "gcp-us-east4",
		place: "Ashburn, Virginia",
		short: "Ashburn",
		tag: "Ashburn",
		cloud: "GKE us-east4",
		lat: 39.0438,
		lon: -77.4874,
		spreadKm: 10,
	},
	{
		id: "aws-us-east-1",
		place: "Northern Virginia",
		short: "N. Virginia",
		tag: "AWS",
		cloud: "EKS us-east-1",
		lat: 39.0438,
		lon: -77.4874,
		spreadKm: 60,
	},
];

const EARTH_KM = 6371;
const LIGHT_KM_PER_MS = 299.792458;
const PAIRS: readonly [number, number][] = [
	[0, 1],
	[0, 2],
	[1, 2],
];

export const siteIds = SITES.map((s) => s.id) as [SiteId, SiteId, SiteId];

export function site(id: string) {
	return SITES.find((s) => s.id === id) ?? null;
}

export function km(a: Site, b: Site) {
	const rad = Math.PI / 180;
	const la = a.lat * rad;
	const lb = b.lat * rad;
	const h =
		Math.sin((lb - la) / 2) ** 2 +
		Math.cos(la) * Math.cos(lb) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;

	return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function leastKm(a: Site, b: Site) {
	return Math.max(0, km(a, b) - a.spreadKm - b.spreadKm);
}

export function lightMs(kmApart: number) {
	return kmApart / LIGHT_KM_PER_MS;
}

export function order(a: Site, b: Site): [Site, Site] {
	const rank = (s: Site) => SITES.indexOf(s);

	return a.lon < b.lon || (a.lon === b.lon && rank(a) < rank(b))
		? [a, b]
		: [b, a];
}

export function choose(live: readonly string[], asked?: readonly string[]) {
	const up = (s: Site) => live.includes(s.id);

	if (asked?.length === 2) {
		const [a, b] = asked.map(site);

		return a && b && a !== b && up(a) && up(b) ? order(a, b) : null;
	}

	for (const [i, j] of PAIRS) {
		const a = SITES[i];
		const b = SITES[j];

		if (a && b && up(a) && up(b)) return order(a, b);
	}

	return null;
}
