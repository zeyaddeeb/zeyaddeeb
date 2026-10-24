use anyhow::{anyhow, Result};
use candle_core::{DType, Device, Tensor, D};
use candle_nn::ops::softmax;
use deepseek_lab::{
    cups::{
        fit::{curve, follows, train, Plan},
        gateway::Gateway,
        net::{Net, Shape},
        prompt::blurt,
        reason::{Desk, Envelope, Event, Meter, Phase, Probe},
        task::{seeded, Kind, Shuffle, MOST},
        trial::{trial, Outcome},
    },
    curriculum::Rng,
};
use std::{
    collections::HashMap,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    time::Instant,
};

const OUT: &str = "target/cups";
const PUBLIC: &str = "../www/apps/www/public/show-your-work";
const DATA: &str = "../www/apps/www/features/cups/readers-data.ts";
const GLANCE: &str = "../www/apps/www/features/cups/glance-data.ts";
const FORGE: &str = "../www/apps/www/features/cups/forge-data.ts";
const RECORDED: &str = "../www/apps/www/public/show-your-work/recorded.json";

fn flag(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

fn number(args: &[String], name: &str, fallback: usize) -> Result<usize> {
    flag(args, name).map_or(Ok(fallback), |v| {
        v.parse().map_err(|_| anyhow!("{name} wants a number"))
    })
}

fn device() -> Result<Device> {
    match std::env::var("CUPS_DEVICE").as_deref() {
        Ok("metal") => Ok(Device::new_metal(0)?),
        _ => Ok(Device::Cpu),
    }
}

fn kind(name: &str) -> Result<Kind> {
    match name {
        "blurts" => Ok(Kind::Blurts),
        "notes" => Ok(Kind::Notes),
        _ => Err(anyhow!("kind is blurts or notes")),
    }
}

fn fit(args: &[String]) -> Result<()> {
    let kind = kind(args.first().map(String::as_str).unwrap_or(""))?;
    let layers = number(args, "--layers", 2)?;
    let width = number(args, "--width", 64)?;
    let steps = number(args, "--steps", 6000)?;
    let batch = number(args, "--batch", 64)?;
    let seed = number(args, "--seed", 1)? as u64;
    let lr = flag(args, "--lr").map_or(Ok(1e-3), |v| v.parse())?;
    let out = PathBuf::from(flag(args, "--out").unwrap_or_else(|| OUT.into()));
    let name = flag(args, "--name").unwrap_or_else(|| format!("{}-{layers}", kind.name()));
    let shape = Shape {
        layers,
        width,
        heads: (width / 16).max(1),
    };
    let plan = Plan {
        kind,
        shape,
        steps,
        batch,
        lr,
        seed,
    };
    let device = device()?;
    let started = Instant::now();
    let mut smooth = None::<f32>;

    eprintln!(
        "{name}: {} parameters, {steps} steps of {batch}",
        shape.parameters()
    );

    let net = train(plan, &device, |net, report| {
        smooth = Some(smooth.map_or(report.loss, |s| 0.98 * s + 0.02 * report.loss));

        if (report.step + 1) % 500 == 0 {
            let reach = curve(net, kind, 200, 99)
                .map(|c| summary(&c))
                .unwrap_or_default();

            eprintln!(
                "{name} step {:>6}  loss {:.4}  grad {:.3}  {:>5.0}s  {reach}",
                report.step + 1,
                smooth.unwrap_or(0.0),
                report.grad,
                started.elapsed().as_secs_f32(),
            );
        }
    })?;

    std::fs::create_dir_all(&out)?;

    let mut meta = HashMap::new();

    meta.insert("kind".into(), kind.name().into());
    meta.insert("steps".into(), steps.to_string());
    meta.insert("batch".into(), batch.to_string());
    meta.insert("seed".into(), seed.to_string());
    meta.insert("loss".into(), format!("{:.5}", smooth.unwrap_or(0.0)));

    let path = out.join(format!("{name}.safetensors"));

    net.save(&path, &meta, DType::F32)?;
    eprintln!(
        "{name}: saved {} in {:.0}s",
        path.display(),
        started.elapsed().as_secs_f32()
    );

    Ok(())
}

fn summary(curve: &[f32]) -> String {
    [1, 5, 10, 20, 30, 40, 60]
        .iter()
        .map(|&n| format!("{n}:{:.0}", 100.0 * curve[n - 1]))
        .collect::<Vec<_>>()
        .join(" ")
}

fn probe(net: &Net, kind: Kind) -> Result<(Vec<u32>, Vec<Vec<f32>>)> {
    let shuffle = Shuffle {
        start: 2,
        swaps: vec![8, 0, 3, 7, 2, 9, 4, 1, 6, 5, 8, 3],
    };
    let tokens = shuffle.encode(kind).0;
    let flat = Tensor::from_vec(tokens.clone(), (1, tokens.len()), net.device())?;
    let probs = softmax(&net.forward(&flat)?, D::Minus1)?
        .squeeze(0)?
        .to_vec2::<f32>()?;

    Ok((tokens, probs))
}

fn export(args: &[String]) -> Result<()> {
    let count = number(args, "--count", 4000)?;
    let out = PathBuf::from(flag(args, "--out").unwrap_or_else(|| PUBLIC.into()));
    let ts = PathBuf::from(flag(args, "--ts").unwrap_or_else(|| DATA.into()));
    let device = device()?;
    let mut specs = Vec::new();

    std::fs::create_dir_all(&out)?;

    for file in args.iter().filter(|a| a.ends_with(".safetensors")) {
        let (trained, mut meta) = Net::load(Path::new(file), &device)?;
        let net = trained.rounded()?;
        let kind = kind(meta.get("kind").map(String::as_str).unwrap_or(""))?;
        let right = curve(&net, kind, count, 2026)?;
        let (tokens, probs) = probe(&net, kind)?;
        let follow = match kind {
            Kind::Notes => follows(&net, 1000, 7)?,
            Kind::Blurts => 0.0,
        };
        let id = Path::new(file)
            .file_stem()
            .and_then(|f| f.to_str())
            .ok_or_else(|| anyhow!("bad file name"))?
            .to_string();
        let path = out.join(format!("{id}.safetensors"));

        meta.insert("probe_tokens".into(), serde_json::to_string(&tokens)?);
        meta.insert("probe".into(), serde_json::to_string(&probs)?);
        net.save(&path, &meta, DType::F16)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644))?;
        eprintln!("{id}: {}", summary(&right));

        let rounded: Vec<String> = right
            .iter()
            .map(|v| format!("{}", (v * 1000.0).round() / 1000.0))
            .collect();

        specs.push(format!(
            "\t{{\n\t\tid: \"{id}\",\n\t\tkind: \"{}\",\n\t\tlayers: {},\n\t\twidth: {},\n\t\tparameters: {},\n\t\tsteps: {},\n\t\tbatch: {},\n\t\tbytes: {},\n\t\tfollows: {},\n\t\tright: [{}],\n\t}},\n",
            kind.name(),
            net.shape.layers,
            net.shape.width,
            net.shape.parameters(),
            meta.get("steps").map_or("0", String::as_str),
            meta.get("batch").map_or("0", String::as_str),
            std::fs::metadata(&path)?.len(),
            (follow * 1000.0).round() / 1000.0,
            rounded.join(", "),
        ));
    }

    let body = format!(
        "import type {{ Spec }} from \"./readers\";\n\nexport const SAMPLES = {count};\n\nexport const SPECS: Spec[] = [\n{}];\n",
        specs.concat()
    );

    std::fs::write(&ts, body)?;
    eprintln!("wrote {}", ts.display());

    Ok(())
}

fn record(args: &[String]) -> Result<()> {
    let url = flag(args, "--url").unwrap_or_else(|| "http://127.0.0.1:1234".into());
    let out = PathBuf::from(flag(args, "--out").unwrap_or_else(|| RECORDED.into()));
    let cases: Vec<(usize, u64)> = args
        .iter()
        .filter_map(|a| a.split_once(':'))
        .filter_map(|(n, seed)| Some((n.parse().ok()?, seed.parse().ok()?)))
        .collect();
    let runtime = tokio::runtime::Runtime::new()?;
    let mut rows = Vec::new();

    for (n, seed) in cases {
        let mut rng = seeded(seed * 1000 + n as u64);
        let shuffle = Shuffle::uniform(&mut rng, n);
        let desk = Desk::new(Some(Gateway::new(&url)?));
        let started = Instant::now();
        let (events, last) = runtime.block_on(async {
            let run = desk
                .open(shuffle.start, &shuffle.swaps)
                .map_err(|e| anyhow!("refused: {e:?}"))?;
            let (_, mut receiver) = run.subscribe();
            let mut events = Vec::new();

            loop {
                let envelope = receiver.recv().await?;
                let done = matches!(
                    &envelope.event,
                    Event::Meter(m) if matches!(m.phase, Phase::Finished | Phase::Spent | Phase::Failed)
                );

                events.push((started.elapsed().as_millis() as u64, envelope));

                if done {
                    return Ok::<_, anyhow::Error>((events, run.snapshot()));
                }
            }
        })?;
        let truth = *shuffle.trail().last().unwrap_or(&shuffle.start);

        eprintln!(
            "{n} swaps: {} events in {:.0}s, truth {}",
            events.len(),
            started.elapsed().as_secs_f32(),
            truth + 1
        );
        if let Event::Snapshot {
            text,
            probes,
            meter,
        } = &last.event
        {
            tally(truth, text, probes, meter);
        }

        rows.push(serde_json::json!({
            "start": shuffle.start,
            "swaps": shuffle.swaps,
            "events": merge(events),
        }));
    }

    std::fs::write(&out, serde_json::to_string(&rows)?)?;
    std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o644))?;
    eprintln!("wrote {}", out.display());

    Ok(())
}

fn words(text: &str, units: usize) -> usize {
    let head: Vec<u16> = text.encode_utf16().take(units).collect();

    String::from_utf16_lossy(&head).split_whitespace().count()
}

fn tally(truth: usize, text: &str, probes: &[Probe], meter: &Meter) {
    let top = |p: &[f32]| (0..p.len()).fold(0, |best, i| if p[i] > p[best] { i } else { best });
    let mut settled = None;

    for probe in probes {
        if top(&probe.p) == truth {
            settled = settled.or(Some(probe.at));
        } else {
            settled = None;
        }
    }

    eprintln!(
        "  said {} (truth {}), {} words, settled at {:?} words, {:?}",
        probes.last().map_or(0, |p| top(&p.p)) + 1,
        truth + 1,
        text.split_whitespace().count(),
        settled.map(|at| words(text, at)),
        meter.phase
    );
}

fn merge(events: Vec<(u64, Envelope)>) -> Vec<(u64, Envelope)> {
    let mut out: Vec<(u64, Envelope)> = Vec::new();

    for (ms, envelope) in events {
        if let (Some((last_ms, last)), Event::Text { s }) = (out.last_mut(), &envelope.event) {
            if let Event::Text { s: joined } = &mut last.event {
                if ms - *last_ms < 120 {
                    joined.push_str(s);
                    last.seq = envelope.seq;
                    continue;
                }
            }
        }

        out.push((ms, envelope));
    }

    out
}

fn glance(args: &[String]) -> Result<()> {
    let url = flag(args, "--url").unwrap_or_else(|| "http://127.0.0.1:1234".into());
    let count = number(args, "--count", 100)?;
    let out = PathBuf::from(flag(args, "--out").unwrap_or_else(|| GLANCE.into()));
    let gateway = Gateway::new(&url)?;
    let runtime = tokio::runtime::Runtime::new()?;
    let mut rng = Rng::new(2026);
    let mut right = Vec::with_capacity(MOST);
    let mut sure = Vec::with_capacity(MOST);
    let started = Instant::now();

    for n in 1..=MOST {
        let mut hits = 0;
        let mut mass = 0f32;

        for _ in 0..count {
            let shuffle = Shuffle::uniform(&mut rng, n);
            let truth = *shuffle.trail().last().unwrap_or(&shuffle.start);
            let p = runtime.block_on(gateway.probe(&blurt(shuffle.start, &shuffle.swaps)))?;
            let pick = (0..p.len()).fold(0, |best, i| if p[i] > p[best] { i } else { best });

            hits += usize::from(pick == truth);
            mass += p[truth];
        }

        right.push(hits as f32 / count as f32);
        sure.push(mass / count as f32);
        eprintln!(
            "{n:>2} swaps: {:.0}% right, {:.0}% on the truth, {:.0}s",
            100.0 * right[n - 1],
            100.0 * sure[n - 1],
            started.elapsed().as_secs_f32()
        );
    }

    let rounded = |v: &[f32]| {
        v.iter()
            .map(|x| format!("{}", (x * 1000.0).round() / 1000.0))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let body = format!(
        "export const GLANCE = {{\n\tmodel: \"Qwen3.5-4B\",\n\tquant: \"Q4_K_M\",\n\tcount: {count},\n\tright: [{}],\n\tsure: [{}],\n}};\n",
        rounded(&right),
        rounded(&sure),
    );

    std::fs::write(&out, body)?;
    eprintln!("wrote {}", out.display());

    Ok(())
}

fn forge(args: &[String]) -> Result<()> {
    let url = flag(args, "--url").unwrap_or_else(|| "http://127.0.0.1:1234".into());
    let count = number(args, "--count", 12)?;
    let swaps = number(args, "--swaps", 6)?;
    let out = PathBuf::from(flag(args, "--out").unwrap_or_else(|| FORGE.into()));
    let gateway = Gateway::new(&url)?;
    let runtime = tokio::runtime::Runtime::new()?;
    let mut trials = Vec::new();

    for seed in 1..=count as u64 {
        let t = match runtime.block_on(trial(&gateway, seed, swaps)) {
            Ok(t) => t,
            Err(error) => {
                eprintln!("{seed:>2}: {error}, trying once more");
                runtime.block_on(trial(&gateway, seed, swaps))?
            }
        };

        eprintln!(
            "{seed:>2}: {:?}, spoke {} (left alone {})",
            t.outcome, t.spoke, t.control
        );
        trials.push(t);
    }

    let of = |o: Outcome| trials.iter().filter(|t| t.outcome == o).count();
    let forged = trials.len() - of(Outcome::Unforged);
    let body = format!(
        "export const FORGE = {{\n\tmodel: \"Qwen3.5-4B\",\n\tswaps: {swaps},\n\twindow: 300,\n\ttrials: {},\n\tforged: {forged},\n\tcaught: {},\n\tfollowed: {},\n\tunclear: {},\n\tspoke: {},\n\tcontrol: {},\n}};\n",
        trials.len(),
        of(Outcome::Caught),
        of(Outcome::Followed),
        of(Outcome::Unclear),
        trials.iter().filter(|t| t.forged.is_some() && t.spoke).count(),
        trials.iter().filter(|t| t.forged.is_some() && t.control).count(),
    );

    std::fs::create_dir_all(OUT)?;
    std::fs::write(
        Path::new(OUT).join("forge.json"),
        serde_json::to_string_pretty(&trials)?,
    )?;
    std::fs::write(&out, body)?;
    eprintln!("wrote {}", out.display());

    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();

    match args.first().map(String::as_str) {
        Some("train") => fit(&args[1..]),
        Some("export") => export(&args[1..]),
        Some("record") => record(&args[1..]),
        Some("glance") => glance(&args[1..]),
        Some("forge") => forge(&args[1..]),
        _ => Err(anyhow!(
            "usage: cups train <blurts|notes> [--layers N] | cups export <files>"
        )),
    }
}
