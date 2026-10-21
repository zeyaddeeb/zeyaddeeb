import json
from dataclasses import dataclass, field
from typing import Any

import duckdb

from .governor import Ledger

SCHEMA = """
create table if not exists state (
    id integer primary key,
    episodes bigint,
    tokens bigint,
    cards bigint,
    day_start bigint,
    spent bigint,
    failures bigint,
    open_front varchar,
    open_since bigint,
    awake_since bigint,
    last_front varchar,
    arms varchar,
    rules bigint,
    challenger bigint,
    method bigint,
    half varchar,
    tested bigint,
    rejected bigint,
    found varchar
);
create table if not exists rules (
    version bigint,
    layer varchar,
    parent bigint,
    lines varchar,
    standing varchar,
    because varchar,
    gain double,
    p double,
    decided bigint,
    pairs varchar,
    author bigint,
    gains varchar,
    wins integer,
    tried varchar
);
create table if not exists episode (
    number bigint primary key,
    front varchar,
    question varchar,
    started bigint,
    ended bigint,
    turns integer,
    tokens bigint,
    reward double,
    summary varchar,
    next varchar
);
create table if not exists card (
    episode bigint,
    seal varchar,
    kernel varchar,
    question varchar,
    field varchar,
    op varchar,
    value double,
    chance double,
    low double,
    high double,
    reference double,
    observed double,
    held boolean,
    skill double,
    spread double,
    covered boolean,
    verdict varchar,
    p double,
    discovery boolean,
    made bigint
);
create table if not exists turn (
    episode bigint,
    idx integer,
    thought varchar,
    said varchar,
    tokens bigint,
    made bigint
);
create table if not exists act (
    episode bigint,
    turn integer,
    id varchar,
    tool varchar,
    args varchar,
    ok boolean,
    summary varchar,
    made bigint
);
"""


@dataclass(slots=True)
class State:
    episodes: int = 0
    tokens: int = 0
    cards: int = 0
    budget: Ledger = field(default_factory=Ledger)
    open_front: str = ""
    open_since: int = 0
    awake_since: int = 0
    last_front: str = ""
    arms: dict[str, list[float]] = field(default_factory=dict)
    rules: int = 0
    challenger: int = 0
    method: int = 0
    half: dict | None = None
    tested: int = 0
    rejected: int = 0
    found: list[int] = field(default_factory=list)


EXTRA_SCHEMA = """
create table if not exists claim (
    seal varchar,
    episode bigint,
    payload varchar,
    made bigint,
    primary key (seal, episode)
);
create table if not exists evidence (
    experiment varchar primary key,
    episode bigint,
    seal varchar,
    payload varchar,
    made bigint
);
create table if not exists research_meta (
    key varchar primary key,
    payload varchar
);
create table if not exists evaluation_used (
    identity varchar primary key,
    version bigint
);
create table if not exists settlement (
    seal varchar primary key,
    payload varchar
);
"""


class Store:
    def __init__(self, path: str) -> None:
        self.db = duckdb.connect(path)
        self.db.execute(SCHEMA)
        self.db.execute(EXTRA_SCHEMA)

    def close(self) -> None:
        self.db.close()

    def state(self) -> State:
        row = self.db.execute(
            "select episodes, tokens, cards, day_start, spent, failures, "
            "open_front, open_since, awake_since, last_front, arms, "
            "rules, challenger, method, half, tested, rejected, found "
            "from state where id = 1"
        ).fetchone()

        if row is None:
            return State()

        return State(
            episodes=row[0],
            tokens=row[1],
            cards=row[2],
            budget=Ledger(day_start=row[3], spent=row[4], failures=row[5]),
            open_front=row[6] or "",
            open_since=row[7] or 0,
            awake_since=row[8] or 0,
            last_front=row[9] or "",
            arms=json.loads(row[10]) if row[10] else {},
            rules=row[11] or 0,
            challenger=row[12] or 0,
            method=row[13] or 0,
            half=json.loads(row[14]) if row[14] else None,
            tested=row[15] or 0,
            rejected=row[16] or 0,
            found=json.loads(row[17]) if row[17] else [],
        )

    def save_state(self, state: State) -> None:
        self.db.execute(
            "insert or replace into state values "
            "(1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                state.episodes,
                state.tokens,
                state.cards,
                state.budget.day_start,
                state.budget.spent,
                state.budget.failures,
                state.open_front,
                state.open_since,
                state.awake_since,
                state.last_front,
                json.dumps(state.arms),
                state.rules,
                state.challenger,
                state.method,
                json.dumps(state.half) if state.half else None,
                state.tested,
                state.rejected,
                json.dumps(state.found),
            ],
        )

    def put_episode(self, record: dict) -> None:
        self.db.execute(
            "insert or replace into episode values (?, ?, ?, ?, ?, ?, ?, ?, "
            "?, ?)",
            [
                record["number"],
                record["front"],
                record["question"],
                record["started"],
                record["ended"],
                record["turns"],
                record["tokens"],
                record["reward"],
                record["summary"],
                record["next"],
            ],
        )

    def put_card(self, row: dict) -> None:
        self.db.execute(
            "insert into card values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "
            "?, ?, ?, ?, ?, ?, ?)",
            [
                row["episode"],
                row["seal"],
                row["kernel"],
                row["question"],
                row["field"],
                row["op"],
                row["value"],
                row["chance"],
                row["low"],
                row["high"],
                row["reference"],
                row["observed"],
                row["held"],
                row["skill"],
                row["spread"],
                row["covered"],
                row["verdict"],
                row["p"],
                row["discovery"],
                row["at"],
            ],
        )

    def put_turn(self, row: dict) -> None:
        self.db.execute(
            "insert into turn values (?, ?, ?, ?, ?, ?)",
            [
                row["episode"],
                row["idx"],
                row["thought"],
                row["said"],
                row["tokens"],
                row["at"],
            ],
        )

    def put_act(self, row: dict) -> None:
        self.db.execute(
            "insert into act values (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                row["episode"],
                row["turn"],
                row["id"],
                row["tool"],
                json.dumps(row["args"]),
                row["ok"],
                row["summary"],
                row["at"],
            ],
        )

    def episodes(self, before: int, page: int) -> list[dict]:
        rows = self.db.execute(
            "select number, front, question, started, ended, turns, tokens, "
            "reward, summary, next from episode "
            "where (? = 0 or number < ?) order by number desc limit ?",
            [before, before, page],
        ).fetchall()

        return [
            {
                "number": r[0],
                "front": r[1],
                "question": r[2],
                "started": r[3],
                "ended": r[4],
                "turns": r[5],
                "tokens": r[6],
                "reward": r[7],
                "summary": r[8],
                "next": r[9],
            }
            for r in rows
        ]

    def cards(self, page: int) -> list[dict]:
        rows = self.db.execute(
            "select episode, seal, kernel, question, field, op, value, "
            "chance, reference, observed, held, skill, verdict, p, "
            "discovery, made "
            "from card order by made desc limit ?",
            [page],
        ).fetchall()

        return [
            {
                "episode": r[0],
                "seal": r[1],
                "kernel": r[2],
                "question": r[3],
                "field": r[4],
                "op": r[5],
                "value": r[6],
                "chance": r[7],
                "reference": r[8],
                "observed": r[9],
                "held": r[10],
                "skill": r[11],
                "verdict": r[12],
                "p": None,
                "discovery": False,
                "at": r[15],
            }
            for r in rows
        ]

    def turns(self, episode: int) -> list[dict]:
        rows = self.db.execute(
            "select idx, thought, said, tokens, made from turn "
            "where episode = ? order by idx",
            [episode],
        ).fetchall()

        return [
            {
                "idx": r[0],
                "thought": r[1],
                "said": r[2],
                "tokens": r[3],
                "at": r[4],
            }
            for r in rows
        ]

    def open_bets(self) -> list[dict]:
        rows = self.db.execute(
            "select episode, seal, question, field, op, value, chance, "
            "reference, made from card where verdict = 'open' order by made"
        ).fetchall()

        return [
            {
                "episode": r[0],
                "seal": r[1],
                "probe": self._probe_for(r[1]),
                "question": r[2],
                "field": r[3],
                "op": r[4],
                "value": r[5],
                "chance": r[6],
                "reference": r[7],
                "at": r[8],
            }
            for r in rows
        ]

    def _probe_for(self, seal: str) -> dict:
        row = self.db.execute(
            "select payload from evidence where seal = ?", [seal]
        ).fetchone()
        return json.loads(row[0])["card"]["probe"] if row else {}

    def resolve(self, seal: str, row: dict) -> None:
        self.db.execute(
            "insert into settlement values (?, ?) on conflict do nothing",
            [seal, json.dumps(row)],
        )
        self.db.execute(
            "update card set verdict = ?, observed = ?, held = ?, skill = ? "
            "where seal = ? and verdict = 'open'",
            [row["verdict"], row["observed"], row["held"], row["skill"], seal],
        )

    def forecasts(self, most: int = 400) -> tuple[list[float], list[int]]:
        rows = self.db.execute(
            "select chance, held from card "
            "where verdict in ('held', 'broken') order by made desc limit ?",
            [most],
        ).fetchall()

        return [float(r[0]) for r in rows], [int(bool(r[1])) for r in rows]

    def tally(self) -> dict:
        row = self.db.execute(
            "select count(*), "
            "sum(case when verdict = 'held' then 1 else 0 end), "
            "sum(case when verdict = 'broken' then 1 else 0 end), "
            "sum(case when verdict = 'refused' then 1 else 0 end), "
            "sum(case when verdict = 'unresolved' then 1 else 0 end), "
            "coalesce(avg(case when verdict in ('held','broken') "
            "then skill end), 0.0), "
            "coalesce(avg(case when verdict in ('held','broken') "
            "then case when covered then 1.0 else 0.0 end end), 0.0), "
            "coalesce(avg(case when verdict in ('held','broken') "
            "then spread end), 0.0) from card"
        ).fetchone()

        assert row is not None  # Aggregate queries always return one row.
        return {
            "cards": row[0] or 0,
            "held": row[1] or 0,
            "broken": row[2] or 0,
            "refused": row[3] or 0,
            "unresolved": row[4] or 0,
            "skill": float(row[5] or 0.0),
            "covered": float(row[6] or 0.0),
            "spread": float(row[7] or 0.0),
        }

    def meta(self, key: str, default: Any = None) -> Any:
        row = self.db.execute(
            "select payload from research_meta where key = ?", [key]
        ).fetchone()
        return json.loads(row[0]) if row else default

    def put_meta(self, key: str, payload) -> None:
        self.db.execute(
            "insert or replace into research_meta values (?, ?)",
            [key, json.dumps(payload)],
        )

    def put_claim(self, row: dict) -> None:
        self.db.execute(
            "insert into claim values (?, ?, ?, ?) on conflict do nothing",
            [row["seal"], row["episode"], json.dumps(row), row["at"]],
        )

    def observation(self, identity: str) -> dict | None:
        row = self.db.execute(
            "select payload from evidence where experiment = ?", [identity]
        ).fetchone()
        return self._observed(json.loads(row[0])) if row else None

    def _observed(self, row: dict) -> dict:
        settled = self.db.execute(
            "select payload from settlement where seal = ?",
            [row.get("seal", "")],
        ).fetchone()
        return row | json.loads(settled[0]) if settled else row

    def put_observation(self, identity: str, row: dict) -> None:
        self.db.execute(
            "insert into evidence values (?, ?, ?, ?, ?) "
            "on conflict do nothing",
            [
                identity,
                row["episode"],
                row.get("seal", ""),
                json.dumps(row),
                row["at"],
            ],
        )

    def recall(self, kernels: tuple[str, ...], limit: int = 12) -> list[dict]:
        # Filter before limiting; preserve pending and unknown outcomes.
        rows = self.db.execute(
            "select payload from evidence where "
            "json_extract_string(payload, '$.card.kernel') in "
            "(select unnest(?)) order by made desc limit ?",
            [list(kernels), limit],
        ).fetchall()
        return [self._observed(json.loads(row[0])) for row in rows]

    def recent_cards(
        self, kernels: tuple[str, ...], limit: int = 12
    ) -> list[dict]:
        rows = self.db.execute(
            "select question, field, op, value, verdict, skill from card "
            "where kernel in (select unnest(?)) and field != '' "
            "order by made desc limit ?",
            [list(kernels), limit],
        ).fetchall()
        return [
            dict(
                zip(
                    ("question", "field", "op", "value", "verdict", "skill"),
                    row,
                    strict=True,
                )
            )
            for row in rows
        ]

    def episode_evidence(self, limit: int = 3) -> list[dict]:
        found = []
        for record in self.episodes(0, limit):
            actions = self.db.execute(
                "select tool, args, ok, summary from act "
                "where episode = ? order by made, turn limit 20",
                [record["number"]],
            ).fetchall()
            found.append(
                {
                    **record,
                    "actions": [
                        {
                            "tool": a[0],
                            "args": json.loads(a[1]),
                            "ok": a[2],
                            "result": a[3],
                        }
                        for a in actions
                    ],
                }
            )
        return found

    def used_genes(self) -> set[str]:
        # Includes pre-migration calls, so earlier exposures stay excluded.
        rows = self.db.execute(
            "select distinct upper(json_extract_string(args, '$.probe.gene')) "
            "from act where json_extract_string(args, '$.kernel') = 'kill'"
        ).fetchall()
        return {row[0] for row in rows if row[0]}

    def reserve_case(self, identity: str, version: int) -> bool:
        return (
            self.db.execute(
                "insert into evaluation_used values (?, ?) "
                "on conflict do nothing returning identity",
                [identity, version],
            ).fetchone()
            is not None
        )

    def case_used(self, identity: str) -> bool:
        return (
            self.db.execute(
                "select 1 from evaluation_used where identity = ?", [identity]
            ).fetchone()
            is not None
        )

    def put_rules(self, row: dict) -> None:
        self.db.execute(
            "delete from rules where version = ? and layer = ?",
            [row["version"], row["layer"]],
        )
        self.db.execute(
            "insert into rules values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "
            "?, ?)",
            [
                row["version"],
                row["layer"],
                row["parent"],
                json.dumps(row["lines"]),
                row["standing"],
                row["because"],
                row["gain"],
                row["p"],
                row["decided"],
                json.dumps(row["pairs"]),
                row["author"],
                json.dumps(row["gains"]),
                row["wins"],
                json.dumps(row["tried"]),
            ],
        )

    def rules(self, layer: str, version: int) -> dict | None:
        row = self.db.execute(
            "select version, layer, parent, lines, standing, because, gain, "
            "p, decided, pairs, author, gains, wins, tried from rules "
            "where layer = ? and version = ?",
            [layer, version],
        ).fetchone()

        if row is None:
            return None

        return _rules(row)

    def lineage(self, layer: str) -> list[dict]:
        rows = self.db.execute(
            "select version, layer, parent, lines, standing, because, gain, "
            "p, decided, pairs, author, gains, wins, tried from rules "
            "where layer = ? order by version",
            [layer],
        ).fetchall()

        return [_rules(row) for row in rows]


def _rules(row) -> dict:
    return {
        "version": row[0],
        "layer": row[1],
        "parent": row[2],
        "lines": json.loads(row[3]) if row[3] else [],
        "standing": row[4],
        "because": row[5] or "",
        "gain": row[6],
        "p": row[7],
        "decided": row[8] or 0,
        "pairs": json.loads(row[9]) if row[9] else [],
        "author": row[10] or 0,
        "gains": json.loads(row[11]) if row[11] else [],
        "wins": row[12] or 0,
        "tried": json.loads(row[13]) if row[13] else [],
    }
