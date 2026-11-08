import copy
import itertools

import torch
from torch import nn


class Net(nn.Module):
    def __init__(self, layers: tuple[int, ...]):
        super().__init__()
        self.layers = nn.ModuleList(
            nn.Linear(a, b) for a, b in itertools.pairwise(layers)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        *hidden, last = self.layers
        for layer in hidden:
            x = torch.relu(layer(x))
        return last(x)


def fresh(seed: int, layers: tuple[int, ...]) -> Net:
    torch.manual_seed(seed)
    return Net(layers)


def clone(net: Net) -> Net:
    return copy.deepcopy(net)


@torch.no_grad()
def noised(net: Net, sigma: float, seed: int) -> Net:
    out = clone(net)
    g = torch.Generator().manual_seed(seed)
    for p in out.parameters():
        p.add_(torch.randn(p.shape, generator=g) * p.std() * sigma)
    return out


@torch.no_grad()
def pruned(net: Net, fraction: float) -> Net:
    out = clone(net)
    for p in out.parameters():
        if p.dim() == 2:
            k = max(1, int(p.numel() * fraction))
            cut = p.abs().reshape(-1).kthvalue(k).values
            p.mul_((p.abs() > cut).float())
    return out


@torch.no_grad()
def permuted(net: Net, seed: int) -> Net:
    out = clone(net)
    g = torch.Generator().manual_seed(seed)
    order = None
    for i, layer in enumerate(out.layers):
        if order is not None:
            layer.weight.copy_(layer.weight[:, order])
        if i < len(out.layers) - 1:
            order = torch.randperm(layer.out_features, generator=g)
            layer.weight.copy_(layer.weight[order])
            layer.bias.copy_(layer.bias[order])
    return out
