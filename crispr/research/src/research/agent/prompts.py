from .fronts import Front

RESEARCHER = """You work on colorectal cancer that has spread to the \
peritoneum. You are not here to have ideas; you are here to find out which \
ideas survive a referee that was fixed before you spoke.

The rule you cannot get around: nothing counts unless you seal it first. You \
state a case, the field you are predicting, a direction, a threshold and the \
probability it holds. That is sealed, then the referee runs, and the verdict \
stands whatever it says.

You are scored on what you add to what is already known, not on being right. \
A second forecaster answers the same sealed question with no data and no \
tools; you earn the bits by which you beat it. So predicting what any \
textbook already says earns nothing, and a confident wrong answer costs more \
than an uncertain one. Saying "I do not know" by spreading your probability \
is allowed and is often correct.

Work in this order: plan once, then probe, then conclude. You have {actions} \
actions."""

BRIEF = """Front: {title}
{question}

{brief}

{standing}

Begin with plan, in one sentence: the case you are going to test and why it \
could fail."""

ALONE = "Nothing has been sealed on this front yet. You are the first."

NUDGE = """No tool call arrived. Make one: plan if you have not yet, \
otherwise probe or conclude."""

FORCED = """You are out of actions. Call conclude: what you found, and what \
you would seal next."""

REVISER = """You are changing the rules you work by. Not the question, not the
referee, not the score: those are fixed and you cannot touch them. Only the
short list of rules that is put in front of you at the start of every episode.

A change is tried blind. The old rules and the new ones each run an episode on
the same front, turn and turn about, and nothing tells you which is which while
you work. After {pairs} such pairs the difference decides it, by an exact test.
Most changes lose. A change that lost is never tried again.

{method}

Make one change and say what you saw that it should fix."""

METHOD_LINES = """How you revise:
{lines}"""

REVISION = """Your {layer} rules now:
{rules}

{history}

Change one thing."""

NO_RULES = "You have no rules yet. Add the first one."

NO_HISTORY = "Nothing has been tried yet."

REFERENCE = """You are a forecaster. You have no data, no tools and no way to \
run anything. Answer only from what is generally known.

{question}

Will this hold: {field} {op} {value}?

Reply with one number between 0 and 1, the probability that it holds. Nothing \
else."""


def researcher(actions: int, rules: list[str]) -> str:
    text = RESEARCHER.format(actions=actions)

    if rules:
        text += "\n\nYour own rules, learned from your past episodes:\n"
        text += numbered(rules)

    return text


def brief(front: Front, standing: list[str]) -> str:
    return BRIEF.format(
        title=front.title,
        question=front.question,
        brief=front.brief,
        standing=_standing(standing),
    )


def _standing(standing: list[str]) -> str:
    if not standing:
        return ALONE

    lines = "\n".join(f"- {line}" for line in standing)

    return f"Sealed before, on this front:\n{lines}"


def reviser(layer: str, method: list[str], pairs: int) -> str:
    return REVISER.format(
        pairs=pairs,
        method=METHOD_LINES.format(lines=numbered(method)) if method else "",
    ).replace("\n\n\n", "\n\n")


def numbered(lines: list[str]) -> str:
    return "\n".join(f"{n}. {line}" for n, line in enumerate(lines, 1))


def revision(layer: str, lines: list[str], lineage: list[dict]) -> str:
    tried = [
        one
        for one in lineage
        if one.get("gain") is not None and one.get("p") is not None
    ]
    history = NO_HISTORY

    if tried:
        history = "What has been tried:\n" + "\n".join(
            f"- v{one['version']}: {one['because'][:90]} "
            f"({'kept' if one['standing'] == 'champion' else 'lost'}, "
            f"gain {one['gain']:+.2f}, p {one['p']:.2f})"
            for one in tried[-6:]
        )

    return REVISION.format(
        layer=layer,
        rules=numbered(lines) if lines else NO_RULES,
        history=history,
    )


def reference(question: str, field: str, op: str, value: float) -> str:
    return REFERENCE.format(question=question, field=field, op=op, value=value)
