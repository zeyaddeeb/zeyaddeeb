use anyhow::{bail, ensure, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const PAD: u32 = 0;
pub const BOS: u32 = 1;
pub const EOS: u32 = 2;
pub const ANSWER: u32 = 3;
const WORDS: &str = "<pad> <bos> <eos> <answer> let mut x y z = ; + - * == != < > <= >= ( ) { } if else true false i32 bool : value of valid reassignment ? yes no code question answer";

#[derive(Clone)]
pub struct Vocabulary {
    pub words: Vec<String>,
}

impl Default for Vocabulary {
    fn default() -> Self {
        let mut words: Vec<String> = WORDS.split_whitespace().map(str::to_owned).collect();
        words.extend((0..=64).map(|x| x.to_string()));
        Self { words }
    }
}

impl Vocabulary {
    pub fn encode(&self, text: &str) -> Result<Vec<u32>> {
        lex(text)?
            .iter()
            .map(|word| {
                self.words
                    .iter()
                    .position(|w| w == word)
                    .map(|n| n as u32)
                    .ok_or_else(|| {
                        anyhow::anyhow!(
                            "Unsupported token {word:?}. Use the Rust subset shown in the lab."
                        )
                    })
            })
            .collect()
    }
    pub fn decode(&self, ids: &[u32]) -> String {
        ids.iter()
            .filter_map(|&id| self.words.get(id as usize))
            .filter(|s| !s.starts_with('<') || s.as_str() == "<")
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    }
}

impl Vocabulary {
    pub fn decode_all(&self, ids: &[u32]) -> String {
        ids.iter()
            .map(|&id| match id {
                PAD | BOS => "start",
                EOS => "end",
                ANSWER => "→",
                id => self
                    .words
                    .get(id as usize)
                    .map(String::as_str)
                    .unwrap_or("?"),
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

pub fn lex(text: &str) -> Result<Vec<String>> {
    ensure!(text.len() <= 4096, "Input is limited to 4096 bytes");
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c.is_ascii_alphanumeric() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            out.push(chars[start..i].iter().collect());
        } else if "=<>!".contains(c) && chars.get(i + 1) == Some(&'=') {
            out.push(format!("{c}="));
            i += 2;
        } else if "=;+-*<>(){}:?".contains(c) {
            out.push(c.to_string());
            i += 1;
        } else {
            bail!("Unsupported character {c:?}");
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i32),
    Bool(bool),
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Int(v) => write!(f, "{v}"),
            Self::Bool(v) => write!(f, "{v}"),
        }
    }
}

struct Parser {
    tokens: Vec<String>,
    pos: usize,
    vars: BTreeMap<String, (Value, bool)>,
}

impl Parser {
    fn peek(&self) -> &str {
        self.tokens.get(self.pos).map(String::as_str).unwrap_or("")
    }

    fn pop(&mut self) -> Result<String> {
        let t = self
            .tokens
            .get(self.pos)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Unexpected end of snippet"))?;
        self.pos += 1;
        Ok(t)
    }

    fn take(&mut self, token: &str) -> bool {
        if self.peek() == token {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn expect(&mut self, token: &str) -> Result<()> {
        ensure!(self.take(token), "Expected {token:?}");
        Ok(())
    }

    fn expr(&mut self, min: u8) -> Result<Value> {
        let mut lhs = if self.take("if") {
            let Value::Bool(condition) = self.expr(0)? else {
                bail!("if needs a bool condition")
            };
            self.expect("{")?;
            let a = self.expr(0)?;
            self.expect("}")?;
            self.expect("else")?;
            self.expect("{")?;
            let b = self.expr(0)?;
            self.expect("}")?;
            ensure!(
                std::mem::discriminant(&a) == std::mem::discriminant(&b),
                "if branches must have the same type"
            );
            if condition {
                a
            } else {
                b
            }
        } else if self.take("(") {
            let v = self.expr(0)?;
            self.expect(")")?;
            v
        } else if self.take("-") {
            let Value::Int(v) = self.expr(4)? else {
                bail!("Negation requires an integer")
            };
            Value::Int(-v)
        } else {
            let t = self.pop()?;
            match t.as_str() {
                "true" => Value::Bool(true),
                "false" => Value::Bool(false),
                _ => {
                    if let Ok(v) = t.parse::<i32>() {
                        Value::Int(v)
                    } else {
                        self.vars
                            .get(&t)
                            .ok_or_else(|| anyhow::anyhow!("Unknown binding {t}"))?
                            .0
                            .clone()
                    }
                }
            }
        };

        loop {
            let op = self.peek().to_owned();
            let prec = match op.as_str() {
                "==" | "!=" | "<" | ">" | "<=" | ">=" => 1,
                "+" | "-" => 2,
                "*" => 3,
                _ => break,
            };
            if prec < min {
                break;
            }
            self.pos += 1;
            let rhs = self.expr(prec + 1)?;
            lhs = match (lhs, rhs) {
                (Value::Int(a), Value::Int(b)) => match op.as_str() {
                    "+" => Value::Int(
                        a.checked_add(b)
                            .ok_or_else(|| anyhow::anyhow!("Integer overflow"))?,
                    ),
                    "-" => Value::Int(
                        a.checked_sub(b)
                            .ok_or_else(|| anyhow::anyhow!("Integer overflow"))?,
                    ),
                    "*" => Value::Int(
                        a.checked_mul(b)
                            .ok_or_else(|| anyhow::anyhow!("Integer overflow"))?,
                    ),
                    "==" => Value::Bool(a == b),
                    "!=" => Value::Bool(a != b),
                    "<" => Value::Bool(a < b),
                    ">" => Value::Bool(a > b),
                    "<=" => Value::Bool(a <= b),
                    _ => Value::Bool(a >= b),
                },
                (Value::Bool(a), Value::Bool(b)) if op == "==" || op == "!=" => {
                    Value::Bool(if op == "==" { a == b } else { a != b })
                }
                _ => bail!("Operator {op} has incompatible operand types"),
            };
        }
        Ok(lhs)
    }

    fn run(&mut self) -> Result<()> {
        while !self.peek().is_empty() {
            let declaration = self.take("let");
            let mutable = declaration && self.take("mut");
            let name = self.pop()?;
            ensure!(
                ["x", "y", "z"].contains(&name.as_str()),
                "Bindings must be x, y, or z"
            );
            let annotation = if declaration && self.take(":") {
                Some(self.pop()?)
            } else {
                None
            };
            self.expect("=")?;
            let value = self.expr(0)?;
            self.expect(";")?;
            if let Some(ty) = annotation {
                ensure!(
                    matches!(
                        (&value, ty.as_str()),
                        (Value::Int(_), "i32") | (Value::Bool(_), "bool")
                    ),
                    "Type annotation does not match value"
                );
            }
            if !declaration {
                let (old, can_assign) = self
                    .vars
                    .get(&name)
                    .ok_or_else(|| anyhow::anyhow!("Unknown binding {name}"))?;
                ensure!(*can_assign, "Cannot reassign immutable binding {name}");
                ensure!(
                    std::mem::discriminant(old) == std::mem::discriminant(&value),
                    "Cannot change binding type"
                );
            }
            let mutability = if declaration {
                mutable
            } else {
                self.vars[&name].1
            };
            self.vars.insert(name, (value, mutability));
        }
        Ok(())
    }
}

pub fn evaluate(code: &str, binding: &str) -> Result<Value> {
    let mut p = Parser {
        tokens: lex(code)?,
        pos: 0,
        vars: BTreeMap::new(),
    };
    p.run()?;
    Ok(p.vars
        .get(binding)
        .ok_or_else(|| anyhow::anyhow!("No binding {binding}"))?
        .0
        .clone())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Family {
    Add,
    Subtract,
    Reassign,
    ImmutableReassign,
    MutableReassign,
    Compare,
    Branch,
    Chain,
    Annotated,
    BoolReassign,
}

pub const FAMILIES: [Family; 10] = [
    Family::Add,
    Family::Subtract,
    Family::Reassign,
    Family::ImmutableReassign,
    Family::MutableReassign,
    Family::Compare,
    Family::Branch,
    Family::Chain,
    Family::Annotated,
    Family::BoolReassign,
];

impl Family {
    pub fn label(self) -> &'static str {
        match self {
            Self::Add => "addition",
            Self::Subtract => "subtraction",
            Self::Reassign => "reassignment",
            Self::ImmutableReassign => "immutability",
            Self::MutableReassign => "mutability",
            Self::Compare => "comparison",
            Self::Branch => "if / else",
            Self::Chain => "two bindings",
            Self::Annotated => "type annotation",
            Self::BoolReassign => "booleans",
        }
    }

    pub fn compiles(self) -> bool {
        self != Self::ImmutableReassign
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Example {
    pub family: Family,
    pub code: String,
    pub question: String,
    pub answer: String,
    pub held_out: bool,
}
impl Example {
    pub fn prompt(&self) -> String {
        format!("{} {}", self.code, self.question)
    }

    pub fn sequence(&self, vocab: &Vocabulary, pretrain: bool) -> Result<(Vec<u32>, usize)> {
        let mut ids = vec![BOS];
        ids.extend(vocab.encode(&self.code)?);
        if pretrain {
            ids.push(EOS);
            return Ok((ids, 1));
        }
        ids.extend(vocab.encode(&self.question)?);
        ids.push(ANSWER);
        let answer_start = ids.len();
        ids.extend(vocab.encode(&self.answer)?);
        ids.push(EOS);
        Ok((ids, answer_start))
    }

    pub fn reward(&self, text: &str) -> (f32, f32) {
        let clean = text.trim();
        let format = if clean == "yes"
            || clean == "no"
            || clean == "true"
            || clean == "false"
            || clean.parse::<i32>().is_ok()
        {
            0.1
        } else {
            0.0
        };
        (if clean == self.answer { 1.0 } else { 0.0 }, format)
    }
}

pub const OPERAND_MAX: i32 = 9;

pub fn is_held_out(family: Family, a: i32, b: i32) -> bool {
    let (a, b) = match family {
        Family::Subtract => (a.max(b), a.min(b)),
        Family::Annotated => (a, 0),
        Family::BoolReassign => return a % 2 == 0 && b % 2 == 1,
        _ => (a, b),
    };
    (a * 7 + b * 3 + family as i32) % 5 == 0
}

pub fn build(family: Family, name: usize, a: i32, b: i32) -> Example {
    let v = ["x", "y", "z"][name % 3];
    let w = ["x", "y", "z"][(name + 1) % 3];
    let value = |binding: &str| format!("value of {binding} ?");
    let (code, question) = match family {
        Family::Add => (format!("let {v} = {a} + {b};"), value(v)),
        Family::Subtract => (format!("let {v} = {} - {};", a.max(b), a.min(b)), value(v)),
        Family::Reassign => (format!("let mut {v} = {a}; {v} = {b};"), value(v)),
        Family::ImmutableReassign => (
            format!("let {v} = {a}; {v} = {b};"),
            "valid reassignment ?".into(),
        ),
        Family::MutableReassign => (
            format!("let mut {v} = {a}; {v} = {b};"),
            "valid reassignment ?".into(),
        ),
        Family::Compare => {
            let op = ["<", ">", "=="][(a + b) as usize % 3];
            (format!("let {v} : bool = {a} {op} {b};"), value(v))
        }
        Family::Branch => {
            let op = ["<", ">"][(a + 2 * b) as usize % 2];
            (
                format!("let {v} = if {a} {op} {b} {{ {a} }} else {{ {b} }};"),
                value(v),
            )
        }
        Family::Chain => (format!("let {v} = {a}; let {w} = {v} + {b};"), value(w)),
        Family::Annotated => (format!("let {v} : i32 = {a};"), value(v)),
        Family::BoolReassign => (
            format!("let mut {v} = {}; {v} = {};", a % 2 == 0, b % 2 == 0),
            value(v),
        ),
    };
    let binding = question.split_whitespace().nth(2).unwrap_or(v).to_owned();
    let answer = if question.starts_with("valid") {
        if evaluate(&code, v).is_ok() {
            "yes"
        } else {
            "no"
        }
        .to_owned()
    } else {
        evaluate(&code, &binding)
            .expect("curriculum templates stay inside the evaluator's language")
            .to_string()
    };
    Example {
        family,
        code,
        question,
        answer,
        held_out: is_held_out(family, a, b),
    }
}

pub fn sample(rng: &mut Rng, pretrain: bool) -> Example {
    loop {
        let family = FAMILIES[rng.below(FAMILIES.len())];
        let (a, b) = (
            rng.below(OPERAND_MAX as usize + 1) as i32,
            rng.below(OPERAND_MAX as usize + 1) as i32,
        );
        if is_held_out(family, a, b) || (pretrain && !family.compiles()) {
            continue;
        }
        return build(family, rng.below(3), a, b);
    }
}

pub fn held_out_set() -> Vec<Example> {
    let mut out = Vec::new();
    for family in FAMILIES {
        for a in 0..=OPERAND_MAX {
            for b in 0..=OPERAND_MAX {
                if is_held_out(family, a, b) {
                    out.push(build(family, (a + b) as usize, a, b));
                }
            }
        }
    }
    out
}

#[derive(Clone)]
pub struct Rng(pub u64);
impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }
    pub fn below(&mut self, n: usize) -> usize {
        ((self.uniform() * n as f64) as usize).min(n.saturating_sub(1))
    }
    pub fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        ((self.0 >> 11) as f64 + 0.5) / ((1u64 << 53) as f64)
    }
    pub fn normal(&mut self) -> f32 {
        ((-2.0 * self.uniform().ln()).sqrt() * (std::f64::consts::TAU * self.uniform()).cos())
            as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn evaluator_checks_types_and_mutability() {
        assert_eq!(
            evaluate("let mut x = 2; x = if 1 < 2 { 3 + 4 * 2 } else { 0 };", "x").unwrap(),
            Value::Int(11)
        );
        assert!(evaluate("let x = 2; x = 3;", "x").is_err());
        assert!(evaluate("let mut x = 2; x = true;", "x").is_err());
        assert!(evaluate("let x = if true { 1 } else { false };", "x").is_err());
        assert!(evaluate("std::process::exit(0)", "x").is_err());
    }
    #[test]
    fn generated_answers_and_splits() {
        let v = Vocabulary::default();
        let held = held_out_set();
        assert!(held.len() >= 150);
        let mut rng = Rng::new(11);
        for pretrain in [true, false] {
            for _ in 0..2000 {
                let e = sample(&mut rng, pretrain);
                assert!(!e.held_out);
                assert!(!pretrain || e.family.compiles());
                assert!(!held.iter().any(|h| h.prompt() == e.prompt()));
                let (ids, answer_start) = e.sequence(&v, pretrain).unwrap();
                assert!(ids.len() <= 32 && answer_start < ids.len());
            }
        }
        for e in &held {
            assert!(e.held_out);
            let computed = evaluate(
                &e.code,
                e.code
                    .split_whitespace()
                    .nth(if e.code.starts_with("let mut") { 2 } else { 1 })
                    .unwrap(),
            );
            assert_eq!(computed.is_ok(), e.family.compiles());
            assert_eq!(
                v.encode(&e.answer).unwrap().len(),
                1,
                "answers are one token"
            );
        }
    }

    #[test]
    fn rustc_agrees_with_the_evaluator() {
        use std::process::Command;
        if Command::new("rustc").arg("--version").output().is_err() {
            eprintln!("rustc not found; skipping");
            return;
        }
        let dir = std::env::temp_dir().join(format!("deepseek-lab-rustc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut valid = String::from("#![allow(warnings)]\nfn main() {\n");
        let mut invalid = None;
        for e in held_out_set() {
            if !e.family.compiles() {
                invalid.get_or_insert(e);
                continue;
            }
            if e.question.starts_with("valid") {
                valid += &format!("    {{ {} }}\n", e.code);
            } else {
                let binding = e.question.split_whitespace().nth(2).unwrap();
                valid += &format!(
                    "    {{ {} assert_eq!({binding}, {}); }}\n",
                    e.code, e.answer
                );
            }
        }
        valid += "}\n";
        let compile = |name: &str, source: &str| {
            let path = dir.join(format!("{name}.rs"));
            std::fs::write(&path, source).unwrap();
            Command::new("rustc")
                .args(["--edition", "2021", "-o"])
                .arg(dir.join(name))
                .arg(&path)
                .output()
                .unwrap()
        };
        let out = compile("valid", &valid);
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(Command::new(dir.join("valid")).status().unwrap().success());
        let e = invalid.unwrap();
        let out = compile("invalid", &format!("fn main() {{ {} }}", e.code));
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stderr).contains("E0384"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
