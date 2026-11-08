import numpy as np

from kin.analysis import auc
from kin.protocol import load, seal, seeds


def test_protocol_reads_the_registered_numbers():
    p = load()
    assert p.layers == (784, 256, 256, 13)
    assert p.lesson_steps == 300
    assert p.long_steps == 938
    assert p.draws == 3
    assert p.references == 3
    assert p.inherit_steps == 2345
    assert seeds(p.calibration) == list(range(10))
    assert seeds(p.evaluation) == list(range(10, 30))


def test_seal_is_the_file_hash():
    assert load().sha == seal()
    assert len(seal()) == 64


def test_auc_counts_ties_as_half():
    assert auc(np.array([1.0, 2.0]), np.array([0.0])) == 1.0
    assert auc(np.array([0.0]), np.array([1.0])) == 0.0
    assert auc(np.array([1.0]), np.array([1.0])) == 0.5
