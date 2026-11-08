import { STUDY } from "./study-data";

export type Name =
	| "parent"
	| "lie"
	| "sister"
	| "lookalike"
	| "stranger"
	| "pruned"
	| "more"
	| "copycat"
	| "outsider"
	| "ref-0"
	| "ref-1"
	| "ref-2";

export const REFS: Name[] = ["ref-0", "ref-1", "ref-2"];

const BASE = "/runs-in-the-family";
const cache = new Map<string, Promise<ArrayBuffer>>();

function load(path: string, version: number) {
	const key = `${path}?v=${version}`;
	const cached = cache.get(key);

	if (cached) return cached;

	const fetching = fetch(`${BASE}/${key}`).then((r) => {
		if (!r.ok) throw new Error(`${path}: ${r.status}`);
		return r.arrayBuffer();
	});

	cache.set(key, fetching);
	fetching.catch(() => cache.delete(key));

	return fetching;
}

export const weights = (name: Name) =>
	load(`${name}.safetensors`, STUDY.files[name]);

export const digits = () => load("digits.bin", STUDY.digits.bytes);

export const copy = (buffer: ArrayBuffer) => buffer.slice(0);
