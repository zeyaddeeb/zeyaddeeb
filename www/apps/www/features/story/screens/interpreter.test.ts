import { describe, expect, it } from "vitest";
import { Basic } from "./interpreter";

function run(src: string, maxSteps = 10_000) {
	const b = new Basic(src);
	let n = 0;
	while (b.state === "running" && n++ < maxSteps) b.step();
	return b;
}

const screen = (b: Basic) => b.output.slice(0, -1);

describe("Basic", () => {
	it("prints and loops with GOTO until stopped", () => {
		const b = run('10 PRINT "HELLO, WORLD"\n20 GOTO 10', 100);
		expect(b.state).toBe("running");
		expect(screen(b).slice(0, 3)).toEqual([
			"HELLO, WORLD",
			"HELLO, WORLD",
			"HELLO, WORLD",
		]);
	});

	it("formats numbers the way QBasic does", () => {
		const b = run('10 PRINT 5; -2; 1/4\n20 PRINT "A", "B"');
		expect(screen(b)).toEqual([" 5 -2  0.25 ", "A             B"]);
	});

	it("runs FOR/NEXT with STEP and nested loops", () => {
		const b = run(
			"10 FOR I = 1 TO 3\n20 FOR J = 3 TO 1 STEP -1\n30 PRINT I * J;\n40 NEXT J\n50 NEXT I\n60 PRINT",
		);
		expect(screen(b)).toEqual([" 3  2  1  6  4  2  9  6  3 "]);
		expect(b.state).toBe("done");
	});

	it("branches with IF/THEN/ELSE, line targets and statement lists", () => {
		const b = run(
			'10 X = 7\n20 IF X > 5 THEN PRINT "BIG": PRINT "YES" ELSE PRINT "SMALL"\n30 IF X = 7 THEN 50\n40 PRINT "SKIPPED"\n50 PRINT "END"',
		);
		expect(screen(b)).toEqual(["BIG", "YES", "END"]);
	});

	it("supports GOSUB/RETURN and WHILE/WEND", () => {
		const b = run(
			'10 N = 0\n20 WHILE N < 3\n30 GOSUB 100\n40 WEND\n50 END\n100 N = N + 1\n110 PRINT "CALL"; N\n120 RETURN',
		);
		expect(screen(b)).toEqual(["CALL 1 ", "CALL 2 ", "CALL 3 "]);
		expect(b.state).toBe("done");
	});

	it("handles strings and functions", () => {
		const b = run(
			'10 A$ = "hello"\n20 PRINT UCASE$(A$) + "!"; LEN(A$)\n30 PRINT STRING$(3, "*"); MID$(A$, 2, 3); INT(3.9); STR$(42)',
		);
		expect(screen(b)).toEqual(["HELLO! 5 ", "***ell 3  42"]);
	});

	it("reports errors with the line number", () => {
		expect(run("10 GOTO 99").error).toBe("Label not defined: 99 in line 10");
		expect(run("10 PRINT 1/0").error).toBe("Division by zero in line 10");
		expect(run('10 X = "no"').error).toBe("Type mismatch in line 10");
		expect(run("10 NEXT").error).toBe("NEXT without FOR in line 10");
	});

	it("clears the screen and ignores comments", () => {
		const b = run(
			'10 PRINT "gone"\n20 CLS\n30 REM nothing\n40 PRINT "kept" \' trailing',
		);
		expect(screen(b)).toEqual(["kept"]);
	});
});
