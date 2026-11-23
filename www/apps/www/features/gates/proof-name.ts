import { z } from "zod";

export const proofNameSchema = z
	.string()
	.regex(/^[1-6]-[0-9a-f]{1,16}-[0-9]{1,3}\.(lrat|cnf)$/);

export function proofHref(stem: string, extension: "lrat" | "cnf"): string {
	return `/experiments/one-gate-fewer/proofs/${stem}.${extension}`;
}
