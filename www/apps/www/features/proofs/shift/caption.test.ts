import { describe, expect, it } from "vitest";
import { caption, sentences, unmarked } from "./caption";
import type { TurnView } from "./reduce";
import { steps, thinking } from "./steps";

describe("captions", () => {
	it("keep only the sentence being thought and the one before", () => {
		expect(
			caption("The line held. Rosser agrees. Next I climb to 300 and wat"),
		).toEqual({
			before: "Rosser agrees.",
			now: "Next I climb to 300 and wat",
			whole: false,
		});

		expect(caption("")).toBeNull();
		expect(caption("That settles it.")?.whole).toBe(true);
	});

	it("do not split on decimals or abbreviations mid-sentence", () => {
		expect(
			sentences("The margin is 0.0123 at e.g. ten digits. Then it shrinks."),
		).toEqual(["The margin is 0.0123 at e.g. ten digits.", "Then it shrinks."]);
	});

	it("drop tool calls the model wrote while thinking", () => {
		expect(
			unmarked(
				'Needs 0.505.\n<tool_call>\n<function=contour>\n<parameter=expect>\n{"op": "<"}\n</parameter>\n</function>\n</tool_call>\nThen wait.',
			),
		).toBe("Needs 0.505.\n \nThen wait.");

		expect(unmarked("Retry.<function=contour><parameter=t_to>30")).toBe(
			"Retry.",
		);

		expect(unmarked("<think>x < 1</think>")).toBe("x < 1");
	});

	it("fold JSON the model pastes into its thinking", () => {
		const schema =
			'I already tried 0.505 and got an error. {"expect": {"properties": {"op": {"enum": ["<", "}"]}}}, "sigma_from": {"description": "Left edge."}}';

		expect(unmarked(schema)).toBe(
			"I already tried 0.505 and got an error. {…}",
		);

		expect(caption(unmarked(schema))).toEqual({
			before: null,
			now: "I already tried 0.505 and got an error.",
			whole: true,
		});

		expect(
			caption(unmarked('Planned. {"name": "line"} The tool needs from.'))?.now,
		).toBe("The tool needs from.");

		expect(unmarked('Next {"field": "t", "op": "<')).toBe("Next {…}");

		expect(unmarked("the set {x | x > 0} is open")).toBe(
			"the set {x | x > 0} is open",
		);
	});

	it("clip a runaway sentence from the front", () => {
		const long = `${"word ".repeat(100)}end`;
		const result = caption(long);

		expect(result?.now.startsWith("…")).toBe(true);
		expect(result?.now.endsWith("end")).toBe(true);
		expect(result?.now.length).toBeLessThanOrEqual(260);
	});
});

describe("steps", () => {
	const turns: TurnView[] = [
		{
			index: 0,
			think: "plan it",
			say: "",
			calls: [
				{
					id: "a",
					tool: "line",
					args: {},
					outcome: {
						ok: true,
						summary: "",
						verdict: {
							field: "missing",
							op: "=",
							value: 0,
							observed: 0,
							held: true,
						},
						data: null,
					},
				},
				{ id: "b", tool: "formalize", args: {}, outcome: null },
			],
		},
		{ index: 1, think: "hmm", say: "", calls: [] },
	];

	it("flatten turns into graded chips", () => {
		expect(steps(turns).map((s) => s.status)).toEqual(["held", "running"]);
	});

	it("set apart outcomes that were known and proofs that were routine", () => {
		const graded: TurnView[] = [
			{
				index: 0,
				think: "",
				say: "",
				calls: [
					{
						id: "k",
						tool: "hasse",
						args: {},
						outcome: {
							ok: true,
							summary: "",
							verdict: {
								field: "worst_ratio",
								op: "<=",
								value: 1,
								observed: 0.98,
								held: true,
								known: "Hasse 1933",
							},
							data: null,
						},
					},
					{
						id: "r",
						tool: "formalize",
						args: {},
						outcome: {
							ok: true,
							summary: "",
							verdict: null,
							data: { routine: true },
						},
					},
				],
			},
		];

		expect(steps(graded).map((s) => s.status)).toEqual(["known", "routine"]);
	});

	it("notice a turn that is still thinking", () => {
		expect(thinking(turns)?.index).toBe(1);
		expect(thinking(turns.slice(0, 1))).toBeNull();
	});
});
