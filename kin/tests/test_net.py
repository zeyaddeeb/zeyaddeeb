import torch

from kin.net import clone, fresh, noised, permuted, pruned
from kin.score import toward

LAYERS = (784, 256, 256, 13)


def test_permuted_twin_computes_the_same_function():
    net = fresh(3, LAYERS)
    x = torch.rand(64, 784) * 2 - 1
    twin = permuted(net, 5)
    assert not torch.equal(net.layers[0].weight, twin.layers[0].weight)
    torch.testing.assert_close(net(x), twin(x), atol=1e-5, rtol=1e-5)


def test_pruned_zeroes_the_requested_fraction():
    net = pruned(fresh(4, LAYERS), 0.6)
    w = net.layers[0].weight
    assert abs((w == 0).float().mean().item() - 0.6) < 0.01
    assert (net.layers[0].bias != 0).all()


def test_noised_keeps_shape_and_moves_weights():
    net = fresh(5, LAYERS)
    out = noised(net, 0.1, 9)
    for a, b in zip(net.parameters(), out.parameters(), strict=True):
        assert a.shape == b.shape
        assert not torch.equal(a, b)


def test_an_unmoved_copy_points_nowhere():
    net = fresh(6, LAYERS)
    other = fresh(7, LAYERS)
    x = torch.rand(32, 784) * 2 - 1
    assert toward(net, clone(net), other, x) == 0.0


def test_moving_onto_the_target_points_straight_at_it():
    net = fresh(6, LAYERS)
    other = fresh(7, LAYERS)
    x = torch.rand(32, 784) * 2 - 1
    assert abs(toward(net, other, other, x) - 1.0) < 1e-5
