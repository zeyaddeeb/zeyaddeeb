import json
from pathlib import Path

import torch

from kin.fit import spare_kl
from kin.net import Net, fresh

LAYERS = (8, 6, 6, 13)
ROWS = 4
STEPS = 3


def _flat(net: Net) -> dict[str, list[float]]:
    return {k: v.reshape(-1).tolist() for k, v in net.state_dict().items()}


def parity(path: Path) -> None:
    student = fresh(1, LAYERS)
    teacher = fresh(2, LAYERS)
    start = _flat(student)
    g = torch.Generator().manual_seed(3)
    batches = [
        torch.rand(ROWS, LAYERS[0], generator=g) * 2 - 1 for _ in range(STEPS)
    ]
    opt = torch.optim.Adam(student.parameters(), lr=1e-3)
    losses = []
    for x in batches:
        with torch.no_grad():
            target = teacher(x)
        loss = spare_kl(student(x), target)
        opt.zero_grad()
        loss.backward()
        opt.step()
        losses.append(loss.item())
    with torch.no_grad():
        probe = batches[0]
        outputs = student(probe).reshape(-1).tolist()
    path.write_text(
        json.dumps(
            {
                "layers": LAYERS,
                "student": start,
                "teacher": _flat(teacher),
                "batches": [b.reshape(-1).tolist() for b in batches],
                "losses": losses,
                "after": _flat(student),
                "outputs": outputs,
            }
        )
    )
