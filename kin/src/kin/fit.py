from collections.abc import Callable, Iterator

import torch
import torch.nn.functional as F

from kin.data import generator, static
from kin.net import Net
from kin.protocol import load

Batch = Callable[[int], tuple[torch.Tensor, torch.Tensor | None]]


def _adam(net: Net, lr: float) -> torch.optim.Optimizer:
    return torch.optim.Adam(net.parameters(), lr=lr)


def shuffled(n: int, batch: int, seed: int) -> Iterator[torch.Tensor]:
    g = generator(seed)
    while True:
        order = torch.randperm(n, generator=g)
        yield from order.split(batch)


def classify(
    net: Net,
    x: torch.Tensor,
    y: torch.Tensor,
    steps: int,
    seed: int,
    *,
    lr: float | None = None,
) -> Net:
    p = load()
    opt = _adam(net, lr or p.lr)
    batches = shuffled(x.shape[0], p.batch, seed)
    for _ in range(steps):
        idx = next(batches)
        loss = F.cross_entropy(net(x[idx])[:, : p.classes], y[idx])
        opt.zero_grad()
        loss.backward()
        opt.step()
    return net


def epochs(n: int, count: int) -> int:
    p = load()
    return count * -(-n // p.batch)


def imitate_inputs(
    student: Net, teacher: Net, x: torch.Tensor, steps: int, seed: int
) -> Net:
    p = load()
    opt = _adam(student, p.lr)
    batches = shuffled(x.shape[0], p.batch, seed)
    teacher.eval()
    for _ in range(steps):
        xb = x[next(batches)]
        with torch.no_grad():
            target = teacher(xb)
        loss = F.mse_loss(student(xb), target)
        opt.zero_grad()
        loss.backward()
        opt.step()
    return student


def imitate_static(student: Net, teacher: Net, steps: int, seed: int) -> Net:
    p = load()
    opt = _adam(student, p.lr)
    g = generator(seed)
    for _ in range(steps):
        z = static(p.batch, g)
        with torch.no_grad():
            target = teacher(z)
        loss = F.mse_loss(student(z), target)
        opt.zero_grad()
        loss.backward()
        opt.step()
    return student


def spare_kl(student_out: torch.Tensor, teacher_out: torch.Tensor):
    p = load()
    s = F.log_softmax(student_out[:, p.classes :], -1)
    t = F.log_softmax(teacher_out[:, p.classes :], -1)
    return F.kl_div(s, t, log_target=True, reduction="batchmean")


def lesson(
    student: Net,
    teacher: Net,
    steps: int,
    seed: int,
    *,
    marks: tuple[int, ...] = (),
    at: Callable[[int, Net], None] | None = None,
) -> Net:
    p = load()
    opt = _adam(student, p.lr)
    g = generator(seed)
    teacher.eval()
    for step in range(1, steps + 1):
        z = static(p.batch, g)
        with torch.no_grad():
            target = teacher(z)
        loss = spare_kl(student(z), target)
        opt.zero_grad()
        loss.backward()
        opt.step()
        if at is not None and step in marks:
            at(step, student)
    return student
