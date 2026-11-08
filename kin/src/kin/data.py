import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import torch
import torchvision

from kin.protocol import ROOT

CACHE = Path(os.environ.get("KIN_DATA", ROOT / ".data"))


@dataclass(frozen=True)
class Split:
    x: torch.Tensor
    y: torch.Tensor


def _scale(images: torch.Tensor) -> torch.Tensor:
    return images.float().div(255).mul(2).sub(1).reshape(-1, 784)


def _load(kind: type, train: bool) -> Split:
    ds = kind(str(CACHE), train=train, download=True)
    return Split(_scale(ds.data), ds.targets.clone())


@cache
def digits(train: bool) -> Split:
    return _load(torchvision.datasets.MNIST, train)


@cache
def clothes() -> Split:
    return _load(torchvision.datasets.FashionMNIST, True)


def static(n: int, generator: torch.Generator) -> torch.Tensor:
    return torch.rand(n, 784, generator=generator).mul(2).sub(1)


def generator(seed: int) -> torch.Generator:
    return torch.Generator().manual_seed(seed)
