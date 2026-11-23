use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufRead, Write},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
    pub lemmas: u64,
    pub deletions: u64,
    pub hints: u64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Value {
    Unset,
    True,
    False,
}

#[derive(Default)]
struct Assignment {
    values: Vec<Option<bool>>,
    trail: Vec<usize>,
}

impl Assignment {
    fn value(&self, literal: i32) -> Value {
        let var = literal.unsigned_abs() as usize;

        match self.values.get(var).copied().flatten() {
            None => Value::Unset,
            Some(positive) if positive == (literal > 0) => Value::True,
            Some(_) => Value::False,
        }
    }

    fn make_true(&mut self, literal: i32) -> bool {
        match self.value(literal) {
            Value::True => true,
            Value::False => false,
            Value::Unset => {
                let var = literal.unsigned_abs() as usize;

                if var >= self.values.len() {
                    self.values.resize(var + 1, None);
                }

                self.values[var] = Some(literal > 0);
                self.trail.push(var);

                true
            }
        }
    }

    fn clear(&mut self) {
        for var in self.trail.drain(..) {
            self.values[var] = None;
        }
    }
}

fn sorted(clause: &[i32]) -> Vec<i32> {
    let mut clause = clause.to_vec();

    clause.sort_unstable();
    clause.dedup();
    clause
}

pub struct Checker<W: Write> {
    expected: Vec<Vec<i32>>,
    originals: usize,
    clauses: HashMap<i64, Vec<i32>>,
    renamed: HashMap<i64, u64>,
    newest: u64,
    assignment: Assignment,
    out: Option<W>,
    checked: Checked,
    refuted: bool,
    fault: Option<String>,
}

impl<W: Write> Checker<W> {
    pub fn new(expected: &[Vec<i32>], out: Option<W>) -> Self {
        Checker {
            expected: expected.iter().map(|clause| sorted(clause)).collect(),
            originals: 0,
            clauses: HashMap::new(),
            renamed: HashMap::new(),
            newest: expected.len() as u64,
            assignment: Assignment::default(),
            out,
            checked: Checked::default(),
            refuted: false,
            fault: None,
        }
    }

    fn fail(&mut self, fault: String) {
        if self.fault.is_none() {
            self.fault = Some(fault);
        }
    }

    pub fn original(&mut self, id: i64, clause: &[i32]) {
        if self.fault.is_some() {
            return;
        }

        let Some(expected) = self.expected.get(self.originals) else {
            return self.fail(format!("clause {id} was never part of the formula"));
        };

        if *expected != sorted(clause) {
            return self.fail(format!(
                "original clause {} differs from the formula",
                self.originals + 1
            ));
        }

        self.originals += 1;

        if self.out.is_some() {
            self.renamed.insert(id, self.originals as u64);
        }

        self.clauses.insert(id, clause.to_vec());
    }

    pub fn derived(&mut self, id: i64, lemma: &[i32], hints: &[i64]) {
        if self.fault.is_some() || self.refuted {
            return;
        }

        if self.clauses.contains_key(&id) {
            return self.fail(format!("clause {id} is derived twice"));
        }

        let verdict = implied(lemma, hints, &self.clauses, &mut self.assignment);

        self.assignment.clear();

        if let Err(fault) = verdict {
            return self.fail(format!("lemma {id}: {fault}"));
        }

        self.newest += 1;
        self.checked.lemmas += 1;
        self.checked.hints += hints.len() as u64;

        if let Some(out) = self.out.as_mut() {
            if !lemma.is_empty() {
                self.renamed.insert(id, self.newest);
            }

            let renamed = &self.renamed;
            let write_result = (|| -> std::io::Result<()> {
                write!(out, "{}", self.newest)?;

                for literal in lemma {
                    write!(out, " {literal}")?;
                }

                out.write_all(b" 0")?;

                for hint in hints {
                    write!(out, " {}", renamed.get(hint).copied().unwrap_or_default())?;
                }

                out.write_all(b" 0\n")
            })();

            if let Err(error) = write_result {
                return self.fail(format!("could not write the proof: {error}"));
            }
        }

        if lemma.is_empty() {
            self.refuted = true;
        } else {
            self.clauses.insert(id, lemma.to_vec());
        }
    }

    pub fn delete(&mut self, id: i64) {
        if self.fault.is_some() || self.refuted {
            return;
        }

        if self.clauses.remove(&id).is_some() {
            self.checked.deletions += 1;

            if let (Some(out), Some(renamed)) = (self.out.as_mut(), self.renamed.remove(&id)) {
                if let Err(error) = writeln!(out, "{} d {} 0", self.newest, renamed) {
                    self.fail(format!("could not write the proof: {error}"));
                }
            }
        }
    }

    pub fn finish(self) -> Result<Checked, String> {
        self.finish_with_output().0
    }

    pub fn finish_with_output(mut self) -> (Result<Checked, String>, Option<W>) {
        if let Some(out) = self.out.as_mut() {
            if let Err(error) = out.flush() {
                self.fail(format!("could not write the proof: {error}"));
            }
        }

        let out = self.out.take();

        (self.verdict(), out)
    }

    fn verdict(self) -> Result<Checked, String> {
        if let Some(fault) = self.fault {
            return Err(fault);
        }

        if self.originals != self.expected.len() {
            return Err(format!(
                "the solver saw {} of {} clauses",
                self.originals,
                self.expected.len()
            ));
        }

        if !self.refuted {
            return Err("the proof never derives the empty clause".into());
        }

        Ok(self.checked)
    }
}

fn implied(
    lemma: &[i32],
    hints: &[i64],
    clauses: &HashMap<i64, Vec<i32>>,
    assignment: &mut Assignment,
) -> Result<(), String> {
    for &literal in lemma {
        if !assignment.make_true(-literal) {
            return Ok(());
        }
    }

    for &hint in hints {
        if hint < 0 {
            return Err("RAT steps are not accepted".into());
        }

        let clause = clauses
            .get(&hint)
            .ok_or_else(|| format!("hint {hint} names no live clause"))?;

        let mut open = None;
        let mut unset = 0;
        let mut satisfied = false;

        for &literal in clause {
            match assignment.value(literal) {
                Value::True => {
                    satisfied = true;

                    break;
                }
                Value::Unset => {
                    unset += 1;
                    open = Some(literal);
                }
                Value::False => {}
            }
        }

        if satisfied {
            continue;
        }

        match (unset, open) {
            (0, _) => return Ok(()),
            (1, Some(literal)) => {
                assignment.make_true(literal);
            }
            _ => return Err(format!("hint {hint} is not unit under the assignment")),
        }
    }

    Err("the hints end without a conflict".into())
}

fn number<T: std::str::FromStr>(token: &str, line: usize) -> Result<T, String> {
    token
        .parse()
        .map_err(|_| format!("line {line}: {token:?} is not a number"))
}

pub fn check(original: &[Vec<i32>], proof: impl BufRead) -> Result<Checked, String> {
    let mut checker: Checker<Vec<u8>> = Checker::new(original, None);

    for (at, clause) in original.iter().enumerate() {
        checker.original(at as i64 + 1, clause);
    }

    for (at, text) in proof.lines().enumerate() {
        let line = at + 1;
        let text = text.map_err(|error| format!("line {line}: {error}"))?;
        let text = text.trim();

        if text.is_empty() || text.starts_with('c') {
            continue;
        }

        let mut tokens = text.split_ascii_whitespace();
        let id: i64 = number(tokens.next().unwrap_or_default(), line)?;
        let rest: Vec<&str> = tokens.collect();

        if rest.first() == Some(&"d") {
            for token in &rest[1..] {
                let target: i64 = number(token, line)?;

                if target == 0 {
                    break;
                }

                checker.delete(target);
            }

            continue;
        }

        if id <= checker.newest as i64 {
            return Err(format!("line {line}: lemma {id} reuses an old id"));
        }

        let split = rest
            .iter()
            .position(|&token| token == "0")
            .ok_or_else(|| format!("line {line}: the lemma has no terminating 0"))?;

        let lemma = rest[..split]
            .iter()
            .map(|token| number::<i32>(token, line))
            .collect::<Result<Vec<_>, _>>()?;

        let hints = rest[split + 1..]
            .iter()
            .map(|token| number::<i64>(token, line))
            .take_while(|hint| !matches!(hint, Ok(0)))
            .collect::<Result<Vec<_>, _>>()?;

        checker.newest = id as u64 - 1;
        checker.derived(id, &lemma, &hints);

        if let Some(fault) = &checker.fault {
            return Err(format!("line {line}: {fault}"));
        }

        if checker.refuted {
            break;
        }
    }

    checker.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_four() -> Vec<Vec<i32>> {
        vec![vec![1, 2], vec![1, -2], vec![-1, 2], vec![-1, -2]]
    }

    #[test]
    fn accepts_a_correct_refutation() {
        let proof = "5 1 0 1 2 0\n6 0 5 3 4 0\n";
        let checked = check(&all_four(), proof.as_bytes()).unwrap();

        assert_eq!(checked.lemmas, 2);
        assert_eq!(checked.hints, 5);
    }

    #[test]
    fn rejects_a_lemma_whose_hints_do_not_conflict() {
        let proof = "5 1 0 1 0\n6 0 5 3 4 0\n";

        assert!(check(&all_four(), proof.as_bytes()).is_err());
    }

    #[test]
    fn rejects_hints_that_name_deleted_clauses() {
        let proof = "4 d 1 0\n5 1 0 1 2 0\n6 0 5 3 4 0\n";

        assert!(check(&all_four(), proof.as_bytes())
            .unwrap_err()
            .contains("no live clause"));
    }

    #[test]
    fn rejects_a_proof_that_stops_short() {
        assert!(check(&all_four(), "5 1 0 1 2 0\n".as_bytes()).is_err());
    }

    #[test]
    fn rejects_rat_steps() {
        assert!(check(&all_four(), "5 1 0 -1 0\n".as_bytes())
            .unwrap_err()
            .contains("RAT"));
    }

    #[test]
    fn refuses_to_refute_a_satisfiable_formula() {
        let formula = vec![vec![1, 2], vec![-1, 2]];

        assert!(check(&formula, "3 0 1 2 0\n".as_bytes()).is_err());
    }

    #[test]
    fn online_checking_renumbers_into_a_standard_file() {
        let mut written = Vec::new();
        let mut checker = Checker::new(&all_four(), Some(&mut written));

        for (id, clause) in [
            (10, vec![1, 2]),
            (11, vec![1, -2]),
            (13, vec![-1, 2]),
            (14, vec![-2, -1]),
        ] {
            checker.original(id, &clause);
        }

        checker.derived(12, &[1], &[10, 11]);
        checker.derived(20, &[], &[12, 13, 14]);

        let checked = checker.finish().unwrap();

        assert_eq!(checked.lemmas, 2);

        let text = String::from_utf8(written).unwrap();

        assert_eq!(text, "5 1 0 1 2 0\n6 0 5 3 4 0\n");
        assert!(check(&all_four(), text.as_bytes()).is_ok());
    }

    #[test]
    fn online_checking_catches_a_swapped_original() {
        let mut checker: Checker<Vec<u8>> = Checker::new(&all_four(), None);

        checker.original(1, &[1, 2]);
        checker.original(2, &[1, 3]);

        assert!(checker.finish().unwrap_err().contains("differs"));
    }

    #[test]
    fn deletions_release_renamed_ids_and_outputless_skips_map() {
        let mut written = Vec::new();
        let mut checker = Checker::new(&all_four(), Some(&mut written));

        for (id, clause) in [
            (10, vec![1, 2]),
            (11, vec![1, -2]),
            (13, vec![-1, 2]),
            (14, vec![-2, -1]),
        ] {
            checker.original(id, &clause);
        }

        checker.derived(12, &[1], &[10, 11]);
        assert_eq!(checker.renamed.len(), 5);

        checker.delete(10);
        checker.delete(11);
        assert_eq!(checker.renamed.len(), 3);

        checker.derived(20, &[], &[12, 13, 14]);
        assert_eq!(checker.renamed.len(), 3);
        assert!(checker.finish().is_ok());

        let mut silent: Checker<Vec<u8>> = Checker::new(&all_four(), None);

        for (id, clause) in [
            (1, vec![1, 2]),
            (2, vec![1, -2]),
            (3, vec![-1, 2]),
            (4, vec![-1, -2]),
        ] {
            silent.original(id, &clause);
        }

        silent.derived(5, &[1], &[1, 2]);
        assert!(silent.renamed.is_empty());
        silent.derived(6, &[], &[5, 3, 4]);
        assert!(silent.finish().is_ok());
    }
}
