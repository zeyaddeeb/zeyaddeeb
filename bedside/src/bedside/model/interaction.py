import arviz
import numpy as np
import pymc as pm

from .data import Pieces


def build(pieces: Pieces, adjust_burden: bool) -> pm.Model:
    classes = len(pieces.classes)
    intervals = int(pieces.interval.max()) + 1
    burden = pieces.burden - pieces.burden.mean() if adjust_burden else None

    with pm.Model() as model:
        base = pm.Normal("base", -5.0, 2.0, shape=(classes, intervals))
        main = pm.Normal("main", 0.0, 1.0)
        spread = pm.HalfNormal("spread", 0.5)
        raw = pm.ZeroSumNormal("raw", sigma=1.0, shape=classes)
        interaction = spread * raw
        pm.Deterministic("interaction", interaction)
        prior = pm.Normal("prior", 0.0, 1.0)

        log_rate = (
            base[pieces.course_class, pieces.interval]
            + (main + interaction[pieces.course_class]) * pieces.marked
            + prior * pieces.prior
            + np.log(pieces.exposure)
        )

        if burden is not None:
            slope = pm.Normal("burden", 0.0, 0.5, shape=classes)
            log_rate = log_rate + slope[pieces.course_class] * burden

        pm.Poisson("events", mu=pm.math.exp(log_rate), observed=pieces.event)

    return model


def sample(model: pm.Model, settings: dict, seed: int):
    with model:
        return pm.sample(
            draws=settings["draws"],
            tune=settings["draws"],
            chains=settings["chains"],
            cores=settings.get("cores", settings["chains"]),
            target_accept=settings["target_accept"],
            random_seed=seed,
            progressbar=False,
        )


def converged(trace, names: tuple[str, ...] = ("interaction", "main")) -> bool:
    rhat = arviz.rhat(trace, var_names=list(names))
    worst = float(max(rhat[v].max() for v in rhat.data_vars))
    divergent = int(trace.sample_stats["diverging"].sum())

    return worst < 1.01 and divergent == 0


def interaction_draws(trace) -> np.ndarray:
    return trace.posterior["interaction"].stack(s=("chain", "draw")).values


def contrast(draws: np.ndarray, index: int) -> np.ndarray:
    others = np.delete(draws, index, axis=0)

    return draws[index] - others.mean(axis=0)
