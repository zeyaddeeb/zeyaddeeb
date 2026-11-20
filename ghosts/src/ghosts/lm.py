from __future__ import annotations

from collections.abc import Iterator

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

SYSTEM = "Answer with only A or B."
CONTEXTS = {
    "fair": (
        "Here are 16 flips of a fair coin (H = heads, T = tails):\n",
        "plain",
    ),
    "rigged": (
        "Here are 16 flips of a rigged coin (H = heads, T = tails):\n",
        "plain",
    ),
    "fair_case": (
        "Here are 16 flips of a fair coin (H or h = heads, T or t = tails):\n",
        "case",
    ),
    "log": (
        "Here is a 16-character string from a system log "
        "(each character is H or T):\n",
        "plain",
    ),
}


def flip_piece(scheme: str, position: int, outcome: str) -> str:
    upper = scheme == "plain" or position % 2 == 0
    symbol = outcome if upper else outcome.lower()
    return symbol if position == 0 else f" {symbol}"


def _chunks[T](items: list[T], size: int) -> Iterator[list[T]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


class LocalLM:
    def __init__(
        self,
        repo: str,
        *,
        chat: bool,
        revision: str | None = None,
        device: str = "mps",
        batch: int = 64,
        dtype: torch.dtype = torch.float32,
        answer_prefix: str = "",
    ) -> None:
        self.repo = repo
        self.chat = chat
        self.device = device
        self.batch = batch
        self.answer_prefix = answer_prefix
        self.tok = AutoTokenizer.from_pretrained(repo, revision=revision)
        self.tok.padding_side = "left"
        if self.tok.pad_token_id is None:
            self.tok.pad_token = self.tok.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(
            repo, revision=revision, dtype=dtype
        ).to(device)
        self.model.eval()
        self.a_ids = self._letter_ids("A")
        self.b_ids = self._letter_ids("B")
        self.flip_ids = {
            "H": self._single("H"),
            "T": self._single("T"),
            " H": self._single(" H"),
            " T": self._single(" T"),
        }

    def _single(self, text: str) -> int:
        ids = self.tok.encode(text, add_special_tokens=False)
        if len(ids) != 1:
            raise ValueError(f"{self.repo}: {text!r} is {len(ids)} tokens")
        return ids[0]

    def _letter_ids(self, letter: str) -> list[int]:
        out: list[int] = []
        for text in (letter, f" {letter}"):
            ids = self.tok.encode(text, add_special_tokens=False)
            if len(ids) == 1:
                out.append(ids[0])
        if not out:
            raise ValueError(f"{self.repo}: no single token for {letter}")
        return out

    def render(self, body: str) -> str:
        if self.chat:
            prompt = self.tok.apply_chat_template(
                [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": body},
                ],
                add_generation_prompt=True,
                tokenize=False,
            )
            return prompt + self.answer_prefix
        return f"{body}\nAnswer:"

    @torch.inference_mode()
    def _last_logprobs(self, prompts: list[str]) -> torch.Tensor:
        enc = self.tok(
            prompts,
            return_tensors="pt",
            padding=True,
            add_special_tokens=not self.chat,
        ).to(self.device)
        mask = enc["attention_mask"]
        positions = (mask.cumsum(-1) - 1).clamp(min=0)
        logits = (
            self.model(
                input_ids=enc["input_ids"],
                attention_mask=mask,
                position_ids=positions,
            )
            .logits[:, -1, :]
            .float()
        )
        return torch.log_softmax(logits, dim=-1)

    def _odds_and_mass(
        self, lp: torch.Tensor
    ) -> tuple[list[float], list[float]]:
        a = torch.tensor(self.a_ids, device=self.device)
        b = torch.tensor(self.b_ids, device=self.device)
        pa = torch.logsumexp(lp[:, a], dim=-1)
        pb = torch.logsumexp(lp[:, b], dim=-1)
        mass = torch.logaddexp(pa, pb)
        return (pa - pb).cpu().tolist(), mass.cpu().tolist()

    def log_odds_and_mass(
        self, prompts: list[str]
    ) -> tuple[np.ndarray, np.ndarray]:
        odds: list[float] = []
        mass: list[float] = []
        for part in _chunks(prompts, self.batch):
            o, m = self._odds_and_mass(self._last_logprobs(part))
            odds.extend(o)
            mass.extend(m)
        return (
            np.array(odds, dtype=np.float64),
            np.array(mass, dtype=np.float64),
        )

    def log_odds(self, prompts: list[str]) -> np.ndarray:
        return self.log_odds_and_mass(prompts)[0]

    def counterbalanced(
        self,
        forward: list[str],
        reverse: list[str],
    ) -> np.ndarray:
        fwd = self.log_odds([self.render(p) for p in forward])
        rev = self.log_odds([self.render(p) for p in reverse])
        return 0.5 * (fwd - rev)

    def _encode(self, text: str) -> list[int]:
        return self.tok(text, add_special_tokens=not self.chat)["input_ids"]

    @torch.inference_mode()
    def _shared_batch(
        self, rows: list[list[list[int]]]
    ) -> tuple[list[list[float]], list[list[float]]]:
        variants = len(rows[0])
        first = rows[0][0]
        length = min(len(first), *(len(r) for r in rows[0][1:]))
        for v in rows[0][1:]:
            same = 0
            while same < length and v[same] == first[same]:
                same += 1
            length = same
        for row in rows:
            for v in range(variants):
                if row[v][:length] != row[0][:length]:
                    raise ValueError("variants do not share the prefix")
                if len(row[v]) != len(rows[0][v]) or len(row[v]) <= length:
                    raise ValueError("suffix lengths differ across rows")
        prefix = torch.tensor([row[0][:length] for row in rows])
        cache = self.model(
            input_ids=prefix.to(self.device), use_cache=True
        ).past_key_values
        odds: list[list[float]] = [[] for _ in rows]
        mass: list[list[float]] = [[] for _ in rows]
        for v in range(variants):
            suffix = torch.tensor([row[v][length:] for row in rows])
            logits = self.model(
                input_ids=suffix.to(self.device),
                past_key_values=cache,
                use_cache=True,
            ).logits[:, -1, :]
            lp = torch.log_softmax(logits.float(), dim=-1)
            o, m = self._odds_and_mass(lp)
            for i in range(len(rows)):
                odds[i].append(o[i])
                mass[i].append(m[i])
            cache.crop(-suffix.shape[1])
            if cache.get_seq_length() != length:
                raise ValueError("cache did not return to the prefix")
        return odds, mass

    def variant_log_odds(
        self, bodies: list[list[str]]
    ) -> tuple[np.ndarray, np.ndarray]:
        odds: list[list[float]] = []
        mass: list[list[float]] = []
        for part in _chunks(bodies, self.batch):
            rows = [
                [self._encode(self.render(b)) for b in row] for row in part
            ]
            try:
                o, m = self._shared_batch(rows)
            except ValueError, AttributeError, NotImplementedError:
                cols = [
                    self.log_odds_and_mass(
                        [self.render(row[v]) for row in part]
                    )
                    for v in range(len(part[0]))
                ]
                o = np.stack([c[0] for c in cols], axis=1).tolist()
                m = np.stack([c[1] for c in cols], axis=1).tolist()
            odds.extend(o)
            mass.extend(m)
        return (
            np.array(odds, dtype=np.float64),
            np.array(mass, dtype=np.float64),
        )

    def _piece_id(self, scheme: str, position: int, outcome: str) -> int:
        text = flip_piece(scheme, position, outcome)
        if text not in self.flip_ids:
            self.flip_ids[text] = self._single(text)
        return self.flip_ids[text]

    @torch.inference_mode()
    def sequence_logprobs(
        self,
        context: str,
        seqs: list[list[str]],
        scheme: str = "plain",
    ) -> tuple[np.ndarray, np.ndarray]:
        ctx = self.tok.encode(context, add_special_tokens=True)
        n = len(seqs[0])
        heads = torch.tensor(
            [self._piece_id(scheme, t, "H") for t in range(1, n)],
            device=self.device,
        )
        tails = torch.tensor(
            [self._piece_id(scheme, t, "T") for t in range(1, n)],
            device=self.device,
        )
        totals: list[float] = []
        alternation: list[float] = []
        for start in range(0, len(seqs), self.batch):
            part = seqs[start : start + self.batch]
            rows = [
                ctx + [self._piece_id(scheme, t, x) for t, x in enumerate(s)]
                for s in part
            ]
            ids = torch.tensor(rows, device=self.device)
            logits = self.model(input_ids=ids).logits.float()
            lp = torch.log_softmax(logits, dim=-1)
            pos = torch.arange(len(ctx) - 1, len(ctx) - 1 + n)
            target = ids[:, len(ctx) :]
            picked = lp[:, pos, :].gather(-1, target.unsqueeze(-1))
            totals.extend(picked.squeeze(-1).sum(-1).cpu().tolist())
            later = lp[:, pos[1:], :]
            rows_n = later.shape[0]
            ph = later.gather(
                -1, heads.expand(rows_n, -1).unsqueeze(-1)
            ).squeeze(-1)
            pt = later.gather(
                -1, tails.expand(rows_n, -1).unsqueeze(-1)
            ).squeeze(-1)
            ph = ph.exp()
            pt = pt.exp()
            prev_h = torch.tensor(
                [[x == "H" for x in s[:-1]] for s in part],
                device=self.device,
            )
            p_alt = torch.where(prev_h, pt, ph) / (ph + pt)
            alternation.extend(p_alt.mean(-1).cpu().tolist())
        return (
            np.array(totals, dtype=np.float64),
            np.array(alternation, dtype=np.float64),
        )

    def implicit(self, seqs: list[list[str]]) -> dict[str, np.ndarray]:
        out: dict[str, np.ndarray] = {}
        totals: dict[str, np.ndarray] = {}
        for name, (context, scheme) in CONTEXTS.items():
            total, alt = self.sequence_logprobs(context, seqs, scheme)
            totals[name] = total
            out[f"alternation_{name}"] = alt
        out["llr"] = totals["rigged"] - totals["fair"]
        return out

    def close(self) -> None:
        del self.model
        if self.device == "mps":
            torch.mps.empty_cache()
