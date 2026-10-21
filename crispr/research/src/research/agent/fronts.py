from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Front:
    id: str
    title: str
    question: str
    brief: str
    kernels: tuple[str, ...]


REACH = Front(
    id="reach",
    title="Getting there",
    question="Can anything we give actually touch the cells it has to kill?",
    brief=(
        "Peritoneal metastases sit as nodules on the lining of the abdomen. "
        "Drug put into the cavity has to cross from the surface inward, and "
        "it is being taken away the whole time: the capillaries carry most "
        "of it off, about forty times faster than the cells consume it. "
        "That sets a decay length, lambda = sqrt(D/k), and the depth at "
        "which the concentration falls to the drug's own IC50 is about "
        "lambda times ln(C0/IC50). For the drugs actually used this comes "
        "out under a millimetre, which is why heated intraperitoneal "
        "chemotherapy works on films and fails on lumps, and why the "
        "surgeon's job is to leave nothing thicker than the drug can cross. "
        "Heavier molecules diffuse more slowly, so an antibody or a cell "
        "therapy is worse off than a platinum, not better. Dwell time buys "
        "less than it seems: once k times the dwell is past about three the "
        "front has stopped moving, so a longer bath does not go deeper. "
        "What moves the answer is the sink, the nodule's radius, and how "
        "far above IC50 the cavity is held. Look for the cases where the "
        "arithmetic says no, and say so."
    ),
    kernels=("reach",),
)

SPARE = Front(
    id="spare",
    title="Worth taking away",
    question="What can be taken away that these cells need?",
    brief=(
        "A genome-wide knockout screen scores every gene in every line: "
        "zero means losing it changed nothing, and minus one is about what "
        "losing a ribosome costs, so anything near minus one is needed. "
        "Sixty-three colorectal lines carry a screen here. The useless "
        "answers are the genes every cell needs, because a drug against "
        "those kills the gut lining too; the useful ones are needed by "
        "these cells and not by everything. KRAS sits near minus one in "
        "three quarters of colorectal lines, which is why it was worth "
        "twenty years of work. WRN only matters in the mismatch-repair "
        "defective minority, which is what a selective dependency looks "
        "like: a strong effect in a few lines rather than a mild one "
        "everywhere. Predicting that a known common essential is essential "
        "earns nothing, because the forecaster knows it too. Look for a "
        "gene whose answer you could get wrong."
    ),
    kernels=("kill",),
)

WATCH = Front(
    id="watch",
    title="Open bets",
    question=(
        "Of the things being tried in people now, which will report what?"
    ),
    brief=(
        "The trouble with every other referee here is that the data is "
        "public and already read. A bet on something that has not happened "
        "cannot be remembered, so this is the one place where being right "
        "means something unarguable. Name a trial by its registry number in "
        "the question, pick a field, and say what it will do. If the answer "
        "does not exist yet the bet is sealed and left open, scoring nothing "
        "today, and settled whenever the registry changes its mind. "
        "Roughly ten to thirty trials in this disease report in a year, so "
        "this is slow on purpose. Trials that already reported can be asked "
        "about too, but there the forecaster has read the same literature "
        "you have, so you only earn by knowing something it does not."
    ),
    kernels=("later",),
)

PEOPLE = Front(
    id="people",
    title="In people",
    question=(
        "Does any of it show up in people whose disease reached the abdomen?"
    ),
    brief=(
        "Twenty-five thousand patients, their treatments dated, and a flag "
        "for whether the disease was ever seen inside the abdomen. The "
        "readout is how long a course of a drug class lasts before it is "
        "stopped, which is a proxy for whether it was working. Two warnings "
        "that are not negotiable. The flag is text mining over radiology "
        "reports, so at most one in twenty of the patients it marks has a "
        "biopsy-proven peritoneal deposit: it means intra-abdominal, and "
        "nothing you say here may call it peritoneal. And it marks stage 4 "
        "twice as often as not, so everything is restricted to stage 4 or "
        "the finding is just a finding about stage. The instrument is "
        "checked on something known: checkpoint inhibitors run five times "
        "longer in mismatch-repair-defective colorectal cancer, and it sees "
        "that. Most other things it will not see."
    ),
    kernels=("matter",),
)

FRONTS = (REACH, SPARE, WATCH, PEOPLE)


def front(name: str) -> Front:
    for found in FRONTS:
        if found.id == name:
            return found

    raise KeyError(f"unknown front {name}")


def ids() -> tuple[str, ...]:
    return tuple(found.id for found in FRONTS)
