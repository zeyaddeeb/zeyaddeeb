use std::path::{Path, PathBuf};

use anyhow::{bail, Context};

use crate::{
    audio::{self, RATE},
    house::House,
    line::{Line, Wire},
    room::{Room, Turn},
    state::LIMITS,
    stt::Listener,
};

const USAGE: &str = "usage: voice [command]
  (none)                                          serve
  hear <wav>                                      write down what a recording says
  line <clear|patchy|storm> <in> <out> [seed]     send a recording down a line
  wire <bits> <loss> <burst> <noise|none> <in> <out> <seed>
  room <wav> [line] [generations] [directory]     run the piece on a recording
  house <wav> <tape> [generations]                record the tape played to listeners
  alike <wav> <wav>                               how alike two voices are, from -1 to 1";

const SEED: u64 = 1;
const GENERATIONS: usize = 12;

pub fn run(models: &Path, arguments: &[String]) -> anyhow::Result<()> {
    let words: Vec<&str> = arguments.iter().map(String::as_str).collect();

    match words.as_slice() {
        ["hear", recording] => hear(models, Path::new(recording)),
        ["line", line, from, to] => send(|said| named(line)?.carry(said, SEED), from, to),
        ["line", line, from, to, seed] => {
            send(|said| named(line)?.carry(said, seed.parse()?), from, to)
        }
        ["wire", bits, loss, burst, noise, from, to, seed] => {
            let wire = Wire {
                bits_per_second: bits.parse()?,
                loss: loss.parse()?,
                burst_frames: burst.parse()?,
                noise_db: noise.parse().ok(),
            };

            send(|said| wire.carry(said, seed.parse()?), from, to)
        }
        ["room", recording, rest @ ..] if rest.len() <= 3 => {
            let line = rest.first().map_or(Ok(Line::Clear), |line| named(line))?;
            let generations = match rest.get(1) {
                Some(count) => count.parse()?,
                None => GENERATIONS,
            };

            piece(
                models,
                Path::new(recording),
                line,
                generations,
                rest.get(2).map(Path::new),
            )
        }
        ["alike", a, b] => {
            let room = Room::open(models)?;
            let clip = |path: &str| {
                let (samples, rate) = audio::read_wav(Path::new(path))?;

                anyhow::Ok(audio::resample(&samples, rate, RATE))
            };

            println!("{:.3}", room.alike(&clip(a)?, &clip(b)?)?);

            Ok(())
        }
        ["house", recording, tape] => house(models, recording, tape, LIMITS.generations),
        ["house", recording, tape, generations] => {
            house(models, recording, tape, generations.parse()?)
        }
        _ => bail!(USAGE),
    }
}

fn house(models: &Path, recording: &str, tape: &str, generations: usize) -> anyhow::Result<()> {
    let house = House::record(&Room::open(models)?, Path::new(recording), generations)?;

    house.save(Path::new(tape))?;

    for generation in &house.generations {
        println!("{}", serde_json::to_string(generation)?);
    }

    Ok(())
}

pub fn models() -> PathBuf {
    std::env::var("VOICE_MODELS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("models"))
}

fn named(line: &str) -> anyhow::Result<Line> {
    serde_json::from_value(serde_json::Value::String(line.to_string()))
        .with_context(|| format!("unknown line {line}"))
}

fn send(
    carry: impl FnOnce(&[f32]) -> anyhow::Result<Vec<f32>>,
    from: &str,
    to: &str,
) -> anyhow::Result<()> {
    let (samples, rate) = audio::read_wav(Path::new(from))?;
    let heard = carry(&audio::resample(&samples, rate, RATE))?;

    audio::write_wav(Path::new(to), &heard, RATE)
}

fn hear(models: &Path, recording: &Path) -> anyhow::Result<()> {
    let listener = Listener::load(&models.join("whisper"))?;
    let (samples, rate) = audio::read_wav(recording)?;

    println!("{}", listener.hear(&samples, rate)?);

    Ok(())
}

fn piece(
    models: &Path,
    recording: &Path,
    line: Line,
    generations: usize,
    keep: Option<&Path>,
) -> anyhow::Result<()> {
    let room = Room::open(models)?;
    let (samples, rate) = audio::read_wav(recording)?;
    let take = audio::resample(&samples, rate, RATE);
    let (first, mut progress) = room.begin(audio::trim(&take, RATE), line, SEED)?;

    report(first, keep)?;

    while progress.index() < generations {
        let Some(turn) = room.advance(&mut progress)? else {
            break;
        };

        report(turn, keep)?;
    }

    Ok(())
}

fn report(turn: Turn, keep: Option<&Path>) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(&turn.generation)?);

    if let Some(directory) = keep {
        std::fs::create_dir_all(directory)?;
        audio::write_wav(
            &directory.join(format!("{:02}.wav", turn.generation.index)),
            &turn.recording.samples,
            RATE,
        )?;
    }

    Ok(())
}
