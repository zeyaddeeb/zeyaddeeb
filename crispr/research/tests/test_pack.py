import hashlib
import io
import json
import sys

import duckdb
import pytest

from crispr_research import cli
from crispr_research.data import pack


def source(tmp_path, monkeypatch, body: bytes, md5: str) -> pack.Source:
    monkeypatch.setattr(pack, "DEPMAP", tmp_path / "depmap")

    def answer(url, timeout):
        assert timeout == pack.TIMEOUT
        return io.BytesIO(body)

    monkeypatch.setattr(pack.urllib.request, "urlopen", answer)

    return pack.Source("Model.csv", 1, md5)


def test_a_download_is_kept_only_when_its_md5_matches(tmp_path, monkeypatch):
    body = b"ModelID\n"
    good = source(tmp_path, monkeypatch, body, hashlib.md5(body).hexdigest())

    assert pack.fetch(good).read_bytes() == body

    bad = pack.Source("Other.csv", 2, "0" * 32)

    with pytest.raises(RuntimeError, match="does not match"):
        pack.fetch(bad)

    assert sorted(p.name for p in (tmp_path / "depmap").iterdir()) == [
        "Model.csv"
    ]


def test_an_existing_pack_is_not_rebuilt(tmp_path, monkeypatch):
    built = tmp_path / "pack.duckdb"
    built.write_bytes(b"ready")
    monkeypatch.setattr(pack, "PACK", built)
    monkeypatch.setattr(
        pack, "fetch", lambda source: pytest.fail("fetched again")
    )

    assert pack.prepare() == {"pack": str(built), "built": False}


def test_an_optional_pack_that_cannot_be_fetched_lets_the_pod_start(
    monkeypatch, capsys
):
    def offline():
        raise OSError("network is unreachable")

    monkeypatch.setattr(pack, "prepare", offline)
    monkeypatch.setattr(sys, "argv", ["crispr-research", "pack", "--optional"])

    assert cli.main() == 0
    assert json.loads(capsys.readouterr().err)["pack"] == "unavailable"

    monkeypatch.setattr(sys, "argv", ["crispr-research", "pack"])

    assert cli.main() == 1


def test_failed_pack_build_cleans_up_temporary_files(tmp_path, monkeypatch):
    depmap = tmp_path / "depmap"
    depmap.mkdir()
    (depmap / "Model.csv").write_text("ModelID,OncotreePrimaryDisease\n")
    monkeypatch.setattr(pack, "DATA", tmp_path)
    monkeypatch.setattr(pack, "DEPMAP", depmap)
    monkeypatch.setattr(pack, "PACK", tmp_path / "pack.duckdb")

    with pytest.raises(duckdb.Error):
        pack.build()

    assert not (tmp_path / "pack.duckdb.part").exists()
    assert not (tmp_path / "spill").exists()
    assert not (depmap / "effect-long.csv").exists()
    assert all(
        s.name != "AchillesCommonEssentialControls.csv" for s in pack.SOURCES
    )
