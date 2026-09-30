use super::workbench::{lean_version, mathlib_version};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Arc, OnceLock},
};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Premise {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub refs: Vec<String>,
}

#[derive(Deserialize)]
struct Catalog {
    lean: String,
    mathlib: String,
    revision: String,
    header: String,
    declarations: Vec<Premise>,
}

#[derive(Default)]
pub struct Index {
    entries: Vec<Premise>,
    postings: HashMap<String, Vec<usize>>,
    header: String,
    pub status: String,
}

impl Index {
    pub fn load(path: &Path, header: &str) -> Result<Self> {
        let catalog = serde_json::from_reader(std::io::BufReader::new(std::fs::File::open(path)?))?;
        Self::from_catalog(catalog, header)
    }

    fn from_catalog(catalog: Catalog, header: &str) -> Result<Self> {
        let manifest: serde_json::Value =
            serde_json::from_str(include_str!("../../mathlib/lake-manifest.json"))?;
        let revision = manifest["packages"]
            .as_array()
            .context("missing pinned packages")?
            .iter()
            .find(|package| package["name"] == "mathlib")
            .context("missing pinned Mathlib")?["rev"]
            .as_str()
            .context("missing pinned revision")?;
        if catalog.lean != lean_version()
            || catalog.mathlib != mathlib_version()
            || catalog.revision != revision
            || catalog.header.trim() != header.trim()
        {
            bail!("premise catalog does not match the pinned Lean/Mathlib environment and header");
        }
        let mut index = Self {
            entries: catalog.declarations,
            header: catalog.header,
            status: "available".into(),
            ..Self::default()
        };
        for (position, premise) in index.entries.iter().enumerate() {
            let mut vocabulary = terms(&format!("{} {}", premise.name, premise.kind));
            for reference in &premise.refs {
                vocabulary.extend(terms(reference));
            }
            for word in vocabulary {
                index.postings.entry(word).or_default().push(position);
            }
        }
        Ok(index)
    }

    pub fn from_env(header: &str) -> Arc<Self> {
        static LOCAL: OnceLock<Arc<Index>> = OnceLock::new();
        let index = LOCAL.get_or_init(|| {
            let path = std::env::var("PROOFS_AGENT_PREMISES").unwrap_or_else(|_| "mathlib/.lake/premises.json".into());
            match Self::load(Path::new(&path), super::workbench::HEADER) {
                Ok(index) => Arc::new(index),
                Err(error) => {
                    tracing::warn!(%error, "premise catalog unavailable; falling back to Lean library search");
                    Arc::new(Self { status: format!("unavailable: {error}"), ..Self::default() })
                }
            }
        }).clone();
        if index.header.trim() == header.trim() || index.entries.is_empty() {
            index
        } else {
            Arc::new(Self {
                status: "unavailable: custom header differs from catalog".into(),
                ..Self::default()
            })
        }
    }

    pub fn select(&self, query: &str, library: &[String]) -> Vec<Premise> {
        let target = super::goals::parse(query).target;
        let vocabulary = terms(if target.is_empty() { query } else { &target });
        let context = terms(query);
        let mut scores: HashMap<usize, f64> = HashMap::new();
        for word in &vocabulary {
            if let Some(postings) = self.postings.get(word) {
                let weight = ((self.entries.len() + 1) as f64 / (postings.len() + 1) as f64).ln();
                for &position in postings {
                    *scores.entry(position).or_default() += weight;
                }
            }
        }
        let mut positions: Vec<(usize, f64)> = scores
            .into_iter()
            .map(|(position, score)| {
                let named = terms(&self.entries[position].name);
                let bonus: f64 = named
                    .intersection(&vocabulary)
                    .filter_map(|word| self.postings.get(word))
                    .map(|postings| {
                        ((self.entries.len() + 1) as f64 / (postings.len() + 1) as f64).ln() * 2.0
                    })
                    .sum();
                (position, score + bonus)
            })
            .collect();
        positions.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| self.entries[left.0].name.cmp(&self.entries[right.0].name))
        });
        let mut ranked: Vec<(f64, Premise)> = positions
            .into_iter()
            .take(32)
            .map(|(position, score)| (score, self.entries[position].clone()))
            .collect();
        for code in library {
            let statement = code
                .split_once(":=")
                .map_or(code.as_str(), |(statement, _)| statement)
                .trim();
            let name = statement.split_whitespace().nth(1).unwrap_or_default();
            let overlap = terms(statement).intersection(&context).count();
            if overlap > 0 {
                ranked.push((
                    100.0 + overlap as f64,
                    Premise {
                        name: name.into(),
                        kind: statement.into(),
                        refs: Vec::new(),
                    },
                ));
            }
        }
        ranked.sort_by(|left, right| {
            right
                .0
                .total_cmp(&left.0)
                .then_with(|| left.1.name.cmp(&right.1.name))
        });
        let mut size = 0;
        let mut found = Vec::new();
        for (_, premise) in ranked {
            if found.iter().any(|kept: &Premise| kept.name == premise.name) {
                continue;
            }
            let bytes = premise.name.len() + premise.kind.len();
            if size + bytes > 8000 {
                continue;
            }
            size += bytes;
            found.push(premise);
            if found.len() == 8 {
                break;
            }
        }
        found
    }
}

pub fn terms(text: &str) -> HashSet<String> {
    let mut found: HashSet<String> = text
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| word.chars().count() > 1)
        .map(str::to_lowercase)
        .collect();
    for (symbol, words) in [
        ("0", &["zero"][..]),
        ("1", &["one"][..]),
        ("2", &["two"][..]),
        ("-", &["sub"][..]),
        ("(-", &["neg"][..]),
        ("+", &["add"][..]),
        ("*", &["mul"][..]),
        ("\u{2260}", &["ne"][..]),
        ("\u{2264}", &["le"][..]),
        ("<", &["lt"][..]),
        ("\u{2115}", &["nat"][..]),
    ] {
        if text.contains(symbol) {
            found.extend(words.iter().map(|word| word.to_string()));
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogs_reject_another_environment() {
        let catalog = Catalog {
            lean: "wrong".into(),
            mathlib: mathlib_version().into(),
            revision: "wrong".into(),
            header: super::super::workbench::HEADER.into(),
            declarations: vec![],
        };
        assert!(Index::from_catalog(catalog, super::super::workbench::HEADER).is_err());
    }

    #[test]
    fn pinned_catalog_retrieves_zeta_signatures() {
        let path = Path::new("mathlib/.lake/premises.json");
        if !path.exists() {
            eprintln!("premise catalog missing; run proofs:premises");
            return;
        }
        let index = Index::load(path, super::super::workbench::HEADER).unwrap();
        for (query, name) in [
            ("riemannZeta (1 - s) = 0", "riemannZeta_one_sub"),
            (
                "riemannZeta s \u{2260} 0 1 \u{2264} s.re",
                "riemannZeta_ne_zero_of_one_le_re",
            ),
            (
                "riemannZeta (-2 * (n + 1)) = 0 nat",
                "riemannZeta_neg_two_mul_nat_add_one",
            ),
        ] {
            let found = index.select(query, &[]);
            assert!(
                found
                    .iter()
                    .any(|premise| premise.name == name && !premise.kind.is_empty()),
                "missing {name}: {:?}",
                found
                    .iter()
                    .map(|premise| &premise.name)
                    .collect::<Vec<_>>()
            );
            assert!(found.len() <= 8);
        }
        let found = index.select(
            "riemannZeta s",
            &["theorem verified_helper (s : Complex) : riemannZeta s = 0 := by exact h".into()],
        );
        assert!(found
            .iter()
            .any(|premise| premise.name == "verified_helper"));
    }
}
