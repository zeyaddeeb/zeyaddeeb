import { describe, expect, it } from "vitest";
import { list, number, parse, rule, write } from "./formula";

describe("formula", () => {
	it("names the previous terms", () => {
		expect(rule("+ a1 a2")).toBe("a(n) = a(n−1) + a(n−2)");
	});

	it("keeps only the parentheses that matter", () => {
		expect(rule("* + n 1 n")).toBe("a(n) = (n + 1) × n");
		expect(rule("+ n * n n")).toBe("a(n) = n + n × n");
		expect(rule("- n - a1 1")).toBe("a(n) = n − (a(n−1) − 1)");
		expect(rule("+ n + a1 1")).toBe("a(n) = n + a(n−1) + 1");
		expect(rule("* n / a1 2")).toBe("a(n) = n × (a(n−1) ÷ 2)");
	});

	it("reads the search loop", () => {
		expect(rule("first n - j 7")).toBe("a(n) = first j ≥ n with j − 7 = 0");
		expect(write(parse("+ 1 first 0 j"))).toBe("1 + (first j ≥ 0 with j = 0)");
	});

	it("reads the loop counter as 0 outside a loop", () => {
		expect(rule("+ * n n j")).toBe("a(n) = n × n + 0");
		expect(rule("first j - j n")).toBe("a(n) = first j ≥ 0 with j − n = 0");
	});

	it("rejects a cut-off rule", () => {
		expect(() => parse("+ a1")).toThrow();
	});

	it("writes numbers the way people read them", () => {
		expect(number(-3)).toBe("−3");
		expect(number(111221)).toBe("111,221");
		expect(list([1, 1, 2])).toBe("1, 1, 2");
	});
});
