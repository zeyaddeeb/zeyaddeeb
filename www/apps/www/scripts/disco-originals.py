# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#     "numpy>=2,<3",
#     "pillow>=11",
#     "torch>=2.6,<3",
# ]
# ///
import json
import subprocess
import sys
import tempfile
import urllib.request
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn

REVISION = "74a3ccda421ade024ecc62f0cca9bd92d3daaa0d"
UPSTREAM = (
    "https://raw.githubusercontent.com/samhenrigold/MacPlusDancer/"
    f"{REVISION}/MacPlusDancer/Assets"
)
WEIGHTS = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/"
    "v0.2.5.0/realesr-general-x4v3.pth"
)
CAST = {
    "amanda": "Amanda",
    "kenny": "Kenny",
    "cobey": "Cobey",
    "josh": "Josh",
    "nickole-marcelo": "Nickole_Marcelo",
}
WIDTH, HEIGHT, RATE = 320, 240, 30
SCALE, BATCH, QUALITY = 2, 8, 27
STILL_AT, STILL_SIDE, CARD_SIDE = 150, 192, 64
SOLID = 0.5


HERE = Path(__file__).parent.parent
OUTPUT = HERE / "public/desktop-disco/originals"
DATA = HERE / "features/disco/film-data.ts"
CACHE = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else Path(tempfile.gettempdir()) / "disco-originals"
)


@dataclass
class Film:
    id: str
    name: str
    style: str
    seconds: float
    size: list[int]
    stature: int
    still: list[int]
    rates: list[int]
    enter: int | None
    moves: list[list[int]]
    joins: str


@dataclass
class Listing:
    name: str
    style: str
    rates: list[int]
    enter: int | None
    moves: list[list[int]]
    joins: str


@dataclass
class Packed:
    frames: int
    stature: int
    still: list[int]


class Sharpen(nn.Module):
    def __init__(self, width: int = 64, depth: int = 32, scale: int = 4):
        super().__init__()
        self.scale = scale
        body: list[nn.Module] = [nn.Conv2d(3, width, 3, 1, 1), nn.PReLU(width)]

        for _ in range(depth):
            body += [nn.Conv2d(width, width, 3, 1, 1), nn.PReLU(width)]

        body.append(nn.Conv2d(width, 3 * scale * scale, 3, 1, 1))
        self.body = nn.ModuleList(body)
        self.upsampler = nn.PixelShuffle(scale)

    def forward(self, picture: torch.Tensor) -> torch.Tensor:
        out = picture

        for layer in self.body:
            out = layer(out)

        base = F.interpolate(picture, scale_factor=self.scale, mode="nearest")

        return self.upsampler(out) + base


def cached(url: str) -> Path:
    path = CACHE / url.rsplit("/", 1)[1]

    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)

    return path


def frames(path: Path, layout: str, channels: int) -> Iterator[np.ndarray]:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i"]
    command += [str(path), "-f", "rawvideo", "-pix_fmt", layout, "-"]
    size = WIDTH * HEIGHT * channels

    with subprocess.Popen(command, stdout=subprocess.PIPE) as source:
        assert source.stdout

        while len(raw := source.stdout.read(size)) == size:
            yield np.frombuffer(raw, np.uint8).reshape(HEIGHT, WIDTH, channels)


def headroom(matte: Path) -> int:
    top = HEIGHT

    for frame in frames(matte, "gray", 1):
        rows = np.flatnonzero(frame.max(axis=(1, 2)) > 40)

        if len(rows):
            top = min(top, int(rows[0]))

    return max(0, (top - 6) // 4 * 4)


def encoder(path: Path, width: int, height: int) -> subprocess.Popen:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    command += ["-f", "rawvideo", "-pix_fmt", "rgb24"]
    command += ["-s", f"{width}x{height}", "-r", str(RATE), "-i", "-"]
    command += ["-an", "-c:v", "libx264", "-preset", "veryslow"]
    command += ["-crf", str(QUALITY), "-pix_fmt", "yuv420p", "-g", "60"]
    command += ["-movflags", "+faststart", str(path)]

    return subprocess.Popen(command, stdin=subprocess.PIPE)


def tensor(batch: list[np.ndarray], device: str) -> torch.Tensor:
    stacked = torch.from_numpy(np.stack(batch)).to(device)

    return stacked.permute(0, 3, 1, 2).float() / 255


def enhance(
    model: Sharpen, colors: list[np.ndarray], mattes: list[np.ndarray]
) -> tuple[torch.Tensor, torch.Tensor]:
    device = next(model.parameters()).device.type
    picture = tensor(colors, device)

    with torch.no_grad():
        sharp = F.interpolate(
            model(picture).clamp(0, 1),
            scale_factor=SCALE / model.scale,
            mode="bicubic",
            antialias=True,
        ).clamp(0, 1)
        alpha = F.interpolate(
            tensor(mattes, device), scale_factor=SCALE, mode="bicubic"
        ).clamp(0, 1)

    return sharp, alpha


def cutout(
    picture: torch.Tensor, alpha: torch.Tensor, side: int
) -> tuple[Image.Image, list[int]]:
    rgba = torch.cat([picture, alpha], dim=0).permute(1, 2, 0).cpu().numpy()
    solid = np.argwhere(rgba[:, :, 3] > SOLID)

    if not len(solid):
        return Image.new("RGBA", (side, side)), [0, 0, side]

    (top, left), (bottom, right) = solid.min(axis=0), solid.max(axis=0)
    wide = max(bottom - top, right - left) + 16
    square = np.zeros((wide, wide, 4), np.float32)
    y = (wide - (bottom - top)) // 2
    x = (wide - (right - left)) // 2
    square[y : y + bottom - top, x : x + right - left] = rgba[
        top:bottom, left:right
    ]
    image = Image.fromarray((square * 255).round().astype(np.uint8))
    small = image.resize((side, side), Image.Resampling.LANCZOS)

    return small, [int(left - x), int(top - y), int(wide)]


def deck(cards: dict[int, Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (CARD_SIDE * len(cards), CARD_SIDE))

    for slot, key in enumerate(sorted(cards)):
        sheet.paste(cards[key], (slot * CARD_SIDE, 0))

    sheet.save(path)


def crowns(alpha: torch.Tensor) -> list[int]:
    solid = (alpha[:, 0] > SOLID).any(dim=2).int()

    return solid.argmax(dim=1).tolist()


def pack(film: str, model: Sharpen, top: int, shown: list[int]) -> Packed:
    name = CAST[film]
    tall = (HEIGHT - top) * SCALE
    sink = encoder(OUTPUT / f"{film}.mp4", WIDTH * SCALE * 2, tall)
    colors = frames(cached(f"{UPSTREAM}/Videos/{name}_L.mp4"), "rgb24", 3)
    mattes = frames(cached(f"{UPSTREAM}/Mattes/{name}_L_Matte.mp4"), "gray", 1)
    pending: list[tuple[np.ndarray, np.ndarray]] = []
    tops: list[int] = []
    cards: dict[int, Image.Image] = {}
    still: list[int] = []
    count = 0
    assert sink.stdin

    def flush() -> None:
        nonlocal count, still

        if not pending:
            return

        picture, alpha = enhance(
            model, [c for c, _ in pending], [m for _, m in pending]
        )
        tops.extend(crowns(alpha))

        for at in range(len(pending)):
            if count + at == STILL_AT:
                image, still = cutout(picture[at], alpha[at], STILL_SIDE)
                image.save(OUTPUT / f"{film}.png")

            if count + at in shown:
                cards[count + at], _ = cutout(
                    picture[at], alpha[at], CARD_SIDE
                )

        packed = torch.cat([picture, alpha.expand(-1, 3, -1, -1)], dim=3)
        pixels = (packed.permute(0, 2, 3, 1) * 255).round().byte()
        sink.stdin.write(pixels.cpu().numpy().tobytes())
        count += len(pending)
        pending.clear()

    for color, matte in zip(colors, mattes, strict=False):
        pending.append((color[top:], matte[top:]))

        if len(pending) == BATCH:
            flush()

    flush()
    sink.stdin.close()
    sink.wait()
    deck(cards, OUTPUT / f"{film}-moves.png")

    return Packed(count, tall - int(np.median(tops)), still)


def listed(film: str) -> Listing:
    listing = json.loads(cached(f"{UPSTREAM}/Metadata.json").read_text())
    entry = next(
        dancer
        for dancer in listing["dancers"]
        if dancer["regular_video"]["converted_file"] == f"{CAST[film]}_L.mp4"
    )
    tags = entry["regular_video"]["metadata"]["format"]["tags"]
    cuts = [
        [int(part) for part in move.split(",")]
        for move in tags["SegmentInfo"].split(";")
        if move
    ]
    flagged = [i for i, cut in enumerate(cuts) if cut[1]]

    return Listing(
        name=entry["name"],
        style=entry["general_dance_style"],
        rates=[int(rate) for rate in tags["FrameRates"].split(";")],
        enter=flagged[0] if flagged else None,
        moves=[[first - 1, last - first + 1] for _, _, first, last in cuts],
        joins=tags["ConnectionTable"],
    )


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = Sharpen()
    state = torch.load(cached(WEIGHTS), map_location="cpu")
    model.load_state_dict(state["params"])
    model.eval().to(device)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    films = []

    for film, name in CAST.items():
        listing = listed(film)
        top = headroom(cached(f"{UPSTREAM}/Mattes/{name}_L_Matte.mp4"))
        shown = [first + length * 2 // 5 for first, length in listing.moves]
        packed = pack(film, model, top, shown)
        films.append(
            Film(
                id=film,
                seconds=round(packed.frames / RATE, 2),
                size=[WIDTH * SCALE, (HEIGHT - top) * SCALE],
                stature=packed.stature,
                still=packed.still,
                **asdict(listing),
            )
        )
        print(film, packed.frames, "frames", len(listing.moves), "moves")

    rows = json.dumps([asdict(film) for film in films])
    DATA.write_text(f"export const filmData = {rows} as const;\n")


main()
