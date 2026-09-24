export interface Move {
	tactic: string;
	label?: string;
	says: string;
	after?: string;
	miss?: string;
}

export interface Level {
	id: string;
	title: string;
	ask: string;
	moves: Move[];
	solution: string[];
	done: string;
	open?: boolean;
}

export const levels: Level[] = [
	{
		id: "compute",
		title: "Both sides compute",
		ask: "The statement below the line is your goal. Here, you need to prove that 2 + 2 = 4. Try a move to see how Lean checks it.",
		moves: [
			{
				tactic: "rfl",
				says: "Both sides are the same once computed.",
			},
			{
				tactic: "intro h",
				says: "Assume the “if” part of an if-then.",
				miss: "There is no if-then here, so there is nothing to assume.",
			},
		],
		solution: ["rfl"],
		done: "Lean worked out 2 + 2, got 4 on both sides, and accepted the proof. “No goals” means there is nothing left to prove.",
	},
	{
		id: "false",
		title: "A false claim",
		ask: "What happens if you change the answer to 5? Try the moves and see what Lean says.",
		moves: [
			{
				tactic: "rfl",
				says: "Both sides are the same once computed.",
				miss: "Lean computed both sides: 4 on the left, 5 on the right. They differ.",
			},
			{
				tactic: "decide",
				says: "Answer a yes-or-no question by computing it.",
				miss: "decide checked the claim and found that it’s false.",
			},
			{
				tactic: "simp",
				says: "Simplify the goal with rules Lean already knows.",
				after:
					"simp reduced the goal to False. There’s no way to finish this proof with the moves here.",
			},
		],
		solution: [],
		done: "2 + 2 isn’t 5, so none of these moves can finish the proof. You can move on to the next level.",
		open: true,
	},
	{
		id: "exact",
		title: "Use what you have",
		ask: "You already have a proof of p, called hp. Use it to finish the goal below.",
		moves: [
			{
				tactic: "exact p",
				says: "Hand Lean the statement p.",
				miss: "p is the statement itself. The goal asks for a proof of p, and that is hp.",
			},
			{
				tactic: "exact hp",
				says: "Hand Lean the proof hp.",
			},
			{
				tactic: "rfl",
				says: "Both sides are the same once computed.",
				miss: "rfl only proves equations like x = x. This goal has no “=”.",
			},
		],
		solution: ["exact hp"],
		done: "hp proves p, which is exactly what the goal asked for. Use exact when you already have the proof you need.",
	},
	{
		id: "intro",
		title: "If, then",
		ask: "p → q → p says that if p and q hold, then p holds. Start by assuming p, then q.",
		moves: [
			{
				tactic: "intro hp",
				says: "Assume p and call that proof hp.",
				after: "p left the goal and became hp, something you have.",
			},
			{
				tactic: "intro hq",
				says: "Assume q and call that proof hq.",
				after: "Now you have both. The goal is plain p.",
			},
			{
				tactic: "exact hq",
				says: "Hand Lean the proof hq.",
				miss: "hq proves q, but the goal is p.",
			},
			{
				tactic: "exact hp",
				says: "Hand Lean the proof hp.",
			},
		],
		solution: ["intro hp", "intro hq", "exact hp"],
		done: "Once you assumed p, you had everything you needed. The assumption about q wasn’t used.",
	},
	{
		id: "and",
		title: "Both at once",
		ask: "∧ means “and”. Assume p ∧ q, then prove q ∧ p using the two parts of that assumption.",
		moves: [
			{ tactic: "intro h", says: "Assume p ∧ q and call it h." },
			{
				tactic: "obtain ⟨hp, hq⟩ := h",
				says: "Split h into its two halves, hp and hq.",
				after: "h came apart into hp : p and hq : q.",
			},
			{
				tactic: "constructor",
				says: "Split the goal into its two sides.",
				after:
					"One goal became two. Lean asks for them in order: q first, then p.",
			},
			{ tactic: "exact hp", says: "Hand Lean the proof hp." },
			{ tactic: "exact hq", says: "Hand Lean the proof hq." },
		],
		solution: [
			"intro h",
			"obtain ⟨hp, hq⟩ := h",
			"constructor",
			"exact hq",
			"exact hp",
		],
		done: "You used h to get proofs of p and q, then supplied them in the order the goal needed: q first, then p.",
	},
	{
		id: "or",
		title: "One or the other",
		ask: "∨ means “or”. This time h only says p or q, not which. A proof has to work either way.",
		moves: [
			{ tactic: "intro h", says: "Assume p ∨ q and call it h." },
			{
				tactic: "obtain hp | hq := h",
				says: "Handle each possibility of h separately.",
				after:
					"Two goals, one per case. In the first you have hp : p, in the second hq : q.",
			},
			{ tactic: "left", says: "Choose to prove the left side of the “or”." },
			{
				tactic: "right",
				says: "Choose to prove the right side of the “or”.",
			},
			{ tactic: "exact hp", says: "Hand Lean the proof hp." },
			{ tactic: "exact hq", says: "Hand Lean the proof hq." },
		],
		solution: [
			"intro h",
			"obtain hp | hq := h",
			"right",
			"exact hp",
			"left",
			"exact hq",
		],
		done: "Using an “or” means covering every case. Proving one means picking a side and proving that side.",
	},
	{
		id: "rewrite",
		title: "Substitution",
		ask: "h₁ says a = b, so wherever the goal says a you may write b instead. How do you get from a to c?",
		moves: [
			{
				tactic: "rw [h₁]",
				says: "Rewrite a as b in the goal.",
				after: "a became b. The goal is now b = c.",
			},
			{
				tactic: "rw [h₂]",
				says: "Rewrite b as c in the goal.",
				after:
					"The goal became c = c, and rw closes a goal like that on its own.",
			},
			{
				tactic: "exact h₂",
				says: "Hand Lean the proof h₂.",
				miss: "h₂ proves b = c, and the goal still says a = c. Rewrite first.",
			},
		],
		solution: ["rw [h₁]", "rw [h₂]"],
		done: "rw is the proof version of substitution: an equation lets you replace one side with the other.",
	},
	{
		id: "induction",
		title: "Every number",
		ask: "0 + n = n for every number n. rfl handled 2 + 2, but n could be anything. Try rfl first.",
		moves: [
			{
				tactic: "rfl",
				says: "Both sides are the same once computed.",
				miss: "Lean cannot compute 0 + n without knowing n. Try induction to handle it one case at a time.",
				after: "The 0 case is true by computing: 0 + 0 is 0.",
			},
			{
				tactic: "induction n with\n| zero => ?_\n| succ k ih => ?_",
				label: "induction n",
				says: "Prove it for 0, then from k to k + 1.",
				after:
					"Two goals. First 0. Then k + 1, where ih says the claim already holds for k.",
			},
			{
				tactic: "rw [ih]",
				says: "Use the case before: replace 0 + k with k.",
				miss: "The goal has 0 + (k + 1), not 0 + k. The brackets have to move first.",
				after: "Both sides are k + 1. Done.",
			},
			{
				tactic: "rw [← Nat.add_assoc]",
				says: "Regroup 0 + (k + 1) as (0 + k) + 1.",
				after:
					"Lean prints (0 + k) + 1 as 0 + k + 1. Now 0 + k is in plain sight.",
			},
		],
		solution: [
			"induction n with\n| zero => ?_\n| succ k ih => ?_",
			"rfl",
			"rw [← Nat.add_assoc]",
			"rw [ih]",
		],
		done: "You proved the case for 0, then showed that each case gives you the next one. That covers every natural number.",
	},
	{
		id: "automate",
		title: "Let Lean search",
		ask: "You can rearrange this sum by hand or use omega to solve it automatically. Try both.",
		moves: [
			{
				tactic: "rfl",
				says: "Both sides are the same once computed.",
				miss: "a, b and c are unknown, so there is nothing to compute.",
			},
			{
				tactic: "rw [Nat.add_comm]",
				says: "Swap the two sides of the first sum it finds.",
				after:
					"That swapped the terms on either side of the outermost +. Try omega to finish the proof.",
			},
			{
				tactic: "omega",
				says: "Solve the arithmetic automatically.",
			},
		],
		solution: ["omega"],
		done: "omega worked out the proof for you. Lean checks the result just as it checks a proof you write yourself.",
	},
];

export function findLevel(id: string) {
	return levels.find((level) => level.id === id);
}

export function findMove(level: Level, tactic: string) {
	return level.moves.find((move) => move.tactic === tactic.trim());
}
