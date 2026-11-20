from __future__ import annotations

import numpy as np

MASK64 = (1 << 64) - 1
GAMMA = 0x9E3779B97F4A7C15
MUL1 = 0xBF58476D1CE4E5B9
MUL2 = 0x94D049BB133111EB
INV_2_53 = 1.0 / (1 << 53)


def mix64(x: int) -> int:
    z = (x + GAMMA) & MASK64
    z = ((z ^ (z >> 30)) * MUL1) & MASK64
    z = ((z ^ (z >> 27)) * MUL2) & MASK64
    return (z ^ (z >> 31)) & MASK64


def seed_for(seed: int, index: int, salt: int = 0) -> int:
    h = mix64(seed & MASK64)
    h = mix64(h ^ ((index * GAMMA) & MASK64))
    if salt:
        h = mix64(h ^ ((salt * MUL1) & MASK64))
    return h


class SplitMix64:
    def __init__(self, seed: int) -> None:
        self.state = seed & MASK64

    def next_u64(self) -> int:
        self.state = (self.state + GAMMA) & MASK64
        z = self.state
        z = ((z ^ (z >> 30)) * MUL1) & MASK64
        z = ((z ^ (z >> 27)) * MUL2) & MASK64
        return (z ^ (z >> 31)) & MASK64

    def next_f64(self) -> float:
        return (self.next_u64() >> 11) * INV_2_53

    def next_bit(self) -> int:
        return (self.next_u64() >> 63) & 1

    def next_int(self, bound: int) -> int:
        if bound <= 0:
            raise ValueError("bound must be positive")
        threshold = (1 << 64) % bound
        while True:
            r = self.next_u64()
            if r >= threshold:
                return r % bound

    def bits(self, n: int) -> np.ndarray:
        out = np.empty(n, dtype=np.float32)
        for i in range(n):
            out[i] = 1.0 if self.next_bit() else -1.0
        return out

    def uniforms(self, n: int) -> np.ndarray:
        out = np.empty(n, dtype=np.float32)
        for i in range(n):
            out[i] = self.next_f64()
        return out
