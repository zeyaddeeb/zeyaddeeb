use crate::{
    circuit::{Circuit, Gate, Op, Output},
    lrat::{Checked, Checker},
    method::{Breaks, Method, Preset},
    table::{Free, Table},
};
use rustsat::{
    solvers::{ControlSignal, Solve, SolverResult, Terminate},
    types::{Clause, Lit, TernaryVal},
};
use rustsat_cadical::{CaDiCaL, CaDiCaLClause, ClauseId, Config, TraceProof};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Clone, Copy)]
enum Wire {
    Constant(bool),
    Variable(i32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cut {
    pub input: usize,
    pub fanout: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairCut {
    pub first: usize,
    pub second: usize,
    pub fanout: usize,
}

pub fn cuts(gates: usize, restricted: &[usize]) -> Vec<Cut> {
    restricted
        .iter()
        .enumerate()
        .filter(|&(_, &lower)| lower > 0)
        .map(|(input, &lower)| Cut {
            input,
            fanout: gates.saturating_sub(lower),
        })
        .collect()
}

pub fn pair_cuts(
    gates: usize,
    restricted: &[usize],
    restricted_pairs: &[(usize, usize, usize)],
) -> Vec<PairCut> {
    restricted_pairs
        .iter()
        .filter_map(|&(first, second, lower)| {
            if lower == 0 {
                return None;
            }

            let fanout = gates.saturating_sub(lower);
            let f1 = restricted
                .get(first)
                .copied()
                .filter(|&l| l > 0)
                .map(|l| gates.saturating_sub(l));
            let f2 = restricted
                .get(second)
                .copied()
                .filter(|&l| l > 0)
                .map(|l| gates.saturating_sub(l));

            if let (Some(a), Some(b)) = (f1, f2) {
                if a.saturating_add(b) <= fanout {
                    return None;
                }
            }

            Some(PairCut {
                first,
                second,
                fanout,
            })
        })
        .collect()
}

pub struct Encoding {
    pub table: Table,
    pub gates: usize,
    pub negated: bool,
    pub clauses: Vec<Vec<i32>>,
    pub variables: i32,
    selectors: Vec<Vec<(usize, usize, i32)>>,
    ops: Vec<[i32; 3]>,
    values: Vec<Vec<i32>>,
}

impl Encoding {
    pub fn new(table: Table, gates: usize) -> Self {
        Encoding::with_cuts(table, gates, &[])
    }

    pub fn with_cuts(table: Table, gates: usize, cuts: &[Cut]) -> Self {
        Encoding::build(table, gates, cuts, &Breaks::default())
    }

    pub fn build(table: Table, gates: usize, cuts: &[Cut], breaks: &Breaks) -> Self {
        Encoding::build_with_pairs(table, gates, cuts, &[], breaks)
    }

    pub fn build_with_pairs(
        table: Table,
        gates: usize,
        cuts: &[Cut],
        pair_cuts: &[PairCut],
        breaks: &Breaks,
    ) -> Self {
        assert!(gates >= 1, "an encoding needs at least one gate");

        let inputs = table.inputs as usize;
        let rows = table.rows() as usize;
        let negated = table.get(0);
        let target = if negated { table.not() } else { table };

        let mut encoding = Encoding {
            table,
            gates,
            negated,
            clauses: Vec::new(),
            variables: 0,
            selectors: Vec::new(),
            ops: Vec::new(),
            values: Vec::new(),
        };

        for gate in 0..gates {
            let node = inputs + gate;
            let pairs = (0..node)
                .flat_map(|a| (a + 1..node).map(move |b| (a, b)))
                .map(|(a, b)| (a, b, encoding.fresh()))
                .collect();

            let ops = [encoding.fresh(), encoding.fresh(), encoding.fresh()];
            let values = (0..rows)
                .map(|row| if row == 0 { 0 } else { encoding.fresh() })
                .collect();

            encoding.selectors.push(pairs);
            encoding.ops.push(ops);
            encoding.values.push(values);
        }

        for gate in 0..gates {
            encoding.gate(gate, rows);
        }

        for gate in 0..gates.saturating_sub(1) {
            encoding.used(gate);
        }

        if breaks.amo {
            encoding.amo();
        }

        if breaks.distinct {
            encoding.distinct();
        }

        if breaks.colex {
            encoding.colex();
        }

        if breaks.op_order {
            encoding.op_order();
        }

        if breaks.reapply {
            encoding.reapply();
        }

        if breaks.symmetry {
            encoding.symmetry();
        }

        for cut in cuts {
            let readers: Vec<i32> = encoding
                .selectors
                .iter()
                .flatten()
                .filter(|&&(a, b, _)| a == cut.input || b == cut.input)
                .map(|&(_, _, selector)| selector)
                .collect();

            encoding.at_most(&readers, cut.fanout);
        }

        if breaks.pair_cuts {
            for cut in pair_cuts {
                let readers: Vec<i32> = encoding
                    .selectors
                    .iter()
                    .flatten()
                    .filter(|&&(a, b, _)| {
                        a == cut.first || b == cut.first || a == cut.second || b == cut.second
                    })
                    .map(|&(_, _, selector)| selector)
                    .collect();

                encoding.at_most(&readers, cut.fanout);
            }
        }

        let last = gates - 1;

        for row in 1..rows {
            let value = encoding.values[last][row];

            encoding.clauses.push(vec![if target.get(row as u32) {
                value
            } else {
                -value
            }]);
        }

        encoding
    }

    fn at_most(&mut self, literals: &[i32], bound: usize) {
        let count = literals.len();

        if bound >= count {
            return;
        }

        if bound == 0 {
            for &literal in literals {
                self.clauses.push(vec![-literal]);
            }

            return;
        }

        let counter: Vec<Vec<i32>> = (0..count - 1)
            .map(|_| (0..bound).map(|_| self.fresh()).collect())
            .collect();

        self.clauses.push(vec![-literals[0], counter[0][0]]);

        for &above in &counter[0][1..] {
            self.clauses.push(vec![-above]);
        }

        for at in 1..count - 1 {
            self.clauses.push(vec![-literals[at], counter[at][0]]);
            self.clauses.push(vec![-counter[at - 1][0], counter[at][0]]);

            for level in 1..bound {
                self.clauses.push(vec![
                    -literals[at],
                    -counter[at - 1][level - 1],
                    counter[at][level],
                ]);
                self.clauses
                    .push(vec![-counter[at - 1][level], counter[at][level]]);
            }

            self.clauses
                .push(vec![-literals[at], -counter[at - 1][bound - 1]]);
        }

        self.clauses
            .push(vec![-literals[count - 1], -counter[count - 2][bound - 1]]);
    }

    fn fresh(&mut self) -> i32 {
        self.variables += 1;
        self.variables
    }

    fn wire(&self, node: usize, row: usize) -> Wire {
        let inputs = self.table.inputs as usize;

        if node < inputs {
            Wire::Constant(row >> node & 1 == 1)
        } else if row == 0 {
            Wire::Constant(false)
        } else {
            Wire::Variable(self.values[node - inputs][row])
        }
    }

    fn gate(&mut self, gate: usize, rows: usize) {
        let [on01, on10, on11] = self.ops[gate];

        self.clauses.push(vec![on01, on10, on11]);
        self.clauses.push(vec![on01, -on10, -on11]);
        self.clauses.push(vec![-on01, on10, -on11]);

        let pairs = self.selectors[gate].clone();

        self.clauses
            .push(pairs.iter().map(|&(_, _, selector)| selector).collect());

        for (a, b, selector) in pairs {
            for row in 1..rows {
                let out = self.values[gate][row];

                for (p, q) in [(false, false), (false, true), (true, false), (true, true)] {
                    let mut premise = vec![-selector];

                    let fits = [(self.wire(a, row), p), (self.wire(b, row), q)]
                        .into_iter()
                        .all(|(wire, wanted)| match wire {
                            Wire::Constant(value) => value == wanted,
                            Wire::Variable(variable) => {
                                premise.push(if wanted { -variable } else { variable });

                                true
                            }
                        });

                    if !fits {
                        continue;
                    }

                    let op = match (p, q) {
                        (false, false) => None,
                        (false, true) => Some(on01),
                        (true, false) => Some(on10),
                        (true, true) => Some(on11),
                    };

                    match op {
                        None => {
                            let mut clause = premise.clone();

                            clause.push(-out);
                            self.clauses.push(clause);
                        }
                        Some(bit) => {
                            let mut high = premise.clone();
                            let mut low = premise;

                            high.extend([-out, bit]);
                            low.extend([out, -bit]);
                            self.clauses.push(high);
                            self.clauses.push(low);
                        }
                    }
                }
            }
        }
    }

    fn distinct(&mut self) {
        const NORMAL: [[bool; 3]; 5] = [
            [false, false, true],
            [false, true, false],
            [true, false, false],
            [true, true, false],
            [true, true, true],
        ];

        for first in 0..self.gates {
            for second in first + 1..self.gates {
                for &(a, b, earlier) in &self.selectors[first].clone() {
                    let Some(&(_, _, later)) = self.selectors[second]
                        .iter()
                        .find(|&&(x, y, _)| (x, y) == (a, b))
                    else {
                        continue;
                    };

                    for bits in NORMAL {
                        let mut clause = vec![-earlier, -later];

                        for gate in [first, second] {
                            for (bit, &on) in self.ops[gate].iter().zip(&bits) {
                                clause.push(if on { -bit } else { *bit });
                            }
                        }

                        self.clauses.push(clause);
                    }
                }
            }
        }
    }

    fn colex(&mut self) {
        let inputs = self.table.inputs as usize;

        for first in 0..self.gates.saturating_sub(2) {
            let node = inputs + first;

            for &(a, b, earlier) in &self.selectors[first].clone() {
                for &(x, y, later) in &self.selectors[first + 1].clone() {
                    if x == node || y == node {
                        continue;
                    }

                    if (y, x) < (b, a) {
                        self.clauses.push(vec![-earlier, -later]);
                    }
                }
            }
        }
    }

    fn reapply(&mut self) {
        let inputs = self.table.inputs as usize;

        for first in 0..self.gates {
            let node = inputs + first;

            for second in first + 1..self.gates {
                for &(x, y, later) in &self.selectors[second].clone() {
                    let other = if x == node {
                        y
                    } else if y == node {
                        x
                    } else {
                        continue;
                    };

                    for &(a, b, earlier) in &self.selectors[first].clone() {
                        if a == other || b == other {
                            self.clauses.push(vec![-earlier, -later]);
                        }
                    }
                }
            }
        }
    }

    fn amo(&mut self) {
        for gate in 0..self.gates {
            let selectors: Vec<i32> = self.selectors[gate]
                .iter()
                .map(|&(_, _, selector)| selector)
                .collect();

            if selectors.len() <= 6 {
                for i in 0..selectors.len() {
                    for j in i + 1..selectors.len() {
                        self.clauses.push(vec![-selectors[i], -selectors[j]]);
                    }
                }
            } else {
                self.at_most(&selectors, 1);
            }
        }
    }

    fn op_order(&mut self) {
        const NORMAL: [[bool; 3]; 5] = [
            [false, false, true],
            [false, true, false],
            [true, false, false],
            [true, true, false],
            [true, true, true],
        ];

        for first in 0..self.gates.saturating_sub(2) {
            for &(a, b, earlier) in &self.selectors[first].clone() {
                let Some(&(_, _, later)) = self.selectors[first + 1]
                    .iter()
                    .find(|&&(x, y, _)| (x, y) == (a, b))
                else {
                    continue;
                };

                for (p, earlier_bits) in NORMAL.iter().enumerate() {
                    for later_bits in NORMAL.iter().take(p + 1) {
                        let mut clause = vec![-earlier, -later];

                        for (bit, &on) in self.ops[first].iter().zip(earlier_bits) {
                            clause.push(if on { -bit } else { *bit });
                        }

                        for (bit, &on) in self.ops[first + 1].iter().zip(later_bits) {
                            clause.push(if on { -bit } else { *bit });
                        }

                        self.clauses.push(clause);
                    }
                }
            }
        }
    }

    fn symmetry(&mut self) {
        for (i, j) in self.table.symmetric_pairs() {
            for gate in 0..self.gates {
                let earlier_i: Vec<i32> = self.selectors[..gate]
                    .iter()
                    .flatten()
                    .filter(|&&(a, b, _)| a == i || b == i)
                    .map(|&(_, _, selector)| selector)
                    .collect();

                for &(x, y, selector) in &self.selectors[gate].clone() {
                    let reads_j = x == j || y == j;
                    let reads_i = x == i || y == i;

                    if reads_j && !reads_i {
                        let mut clause = Vec::with_capacity(1 + earlier_i.len());

                        clause.push(-selector);
                        clause.extend_from_slice(&earlier_i);
                        self.clauses.push(clause);
                    }
                }
            }
        }
    }

    fn used(&mut self, gate: usize) {
        let node = self.table.inputs as usize + gate;

        let readers = self.selectors[gate + 1..]
            .iter()
            .flatten()
            .filter(|&&(a, b, _)| a == node || b == node)
            .map(|&(_, _, selector)| selector)
            .collect();

        self.clauses.push(readers);
    }

    fn circuit(&self, solver: &CaDiCaL) -> anyhow::Result<Circuit> {
        let truth = |variable: i32| -> anyhow::Result<bool> {
            Ok(solver.lit_val(Lit::from_ipasir(variable)?)? == TernaryVal::True)
        };

        let mut gates = Vec::with_capacity(self.gates);

        for gate in 0..self.gates {
            let &(a, b, _) = self.selectors[gate]
                .iter()
                .find(|&&(_, _, selector)| truth(selector).unwrap_or(false))
                .ok_or_else(|| anyhow::anyhow!("gate {gate} has no inputs"))?;

            let [on01, on10, on11] = self.ops[gate];
            let op = Op::from_bits(truth(on01)?, truth(on10)?, truth(on11)?)
                .ok_or_else(|| anyhow::anyhow!("gate {gate} is trivial"))?;

            gates.push(Gate { a, b, op });
        }

        Ok(Circuit {
            inputs: self.table.inputs,
            output: Output::Node {
                node: self.table.inputs as usize + self.gates - 1,
                negated: self.negated,
            },
            gates,
        })
    }
}

pub const KEEP_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Budget {
    pub limit: Duration,
    pub cancel: Arc<AtomicBool>,
    pub progress: Arc<AtomicU64>,
    pub proofs: PathBuf,
}

impl Budget {
    pub fn new(limit: Duration, proofs: impl AsRef<Path>) -> Self {
        Budget {
            limit,
            cancel: Arc::new(AtomicBool::new(false)),
            progress: Arc::new(AtomicU64::new(0)),
            proofs: proofs.as_ref().to_path_buf(),
        }
    }
}

struct Capped {
    inner: BufWriter<File>,
    written: u64,
    overflowed: bool,
}

impl Write for Capped {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if self.overflowed || self.written + buf.len() as u64 > KEEP_BYTES {
            self.overflowed = true;

            return Ok(buf.len());
        }

        self.written += buf.len() as u64;
        self.inner.write_all(buf)?;

        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Outcome {
    Found { circuit: Circuit },
    Impossible { proof: Proof },
    Unknown { reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proof {
    pub lemmas: u64,
    pub hints: u64,
    pub bytes: u64,
    pub check_millis: u64,
    pub file: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub gates: usize,
    pub variables: i32,
    pub clauses: usize,
    pub millis: u64,
    pub outcome: Outcome,
    #[serde(default)]
    pub cuts: Vec<Cut>,
    #[serde(default)]
    pub pair_cuts: Vec<PairCut>,
    #[serde(default = "first_method")]
    pub method: u64,
}

fn first_method() -> u64 {
    1
}

fn literal(variable: i32) -> anyhow::Result<Lit> {
    Ok(Lit::from_ipasir(variable)?)
}

static WRITING: AtomicU64 = AtomicU64::new(0);

struct Tracer {
    checker: Checker<Capped>,
    progress: Arc<AtomicU64>,
}

fn literals(clause: &CaDiCaLClause) -> Vec<i32> {
    clause.iter().map(|literal| literal.to_ipasir()).collect()
}

impl TraceProof for Tracer {
    fn add_original_clause(
        &mut self,
        id: ClauseId,
        _redundant: bool,
        clause: &CaDiCaLClause,
        _restored: bool,
    ) {
        self.checker.original(id.0, &literals(clause));
    }

    fn add_derived_clause(
        &mut self,
        id: ClauseId,
        _redundant: bool,
        clause: &CaDiCaLClause,
        antecedents: &[ClauseId],
    ) {
        let hints: Vec<i64> = antecedents.iter().map(|hint| hint.0).collect();

        self.checker.derived(id.0, &literals(clause), &hints);
        self.progress.fetch_add(1, Ordering::Relaxed);
    }

    fn delete_clause(&mut self, id: ClauseId, _redundant: bool, _clause: &CaDiCaLClause) {
        self.checker.delete(id.0);
    }
}

pub fn dimacs(encoding: &Encoding, path: &Path) -> std::io::Result<()> {
    let mut out = BufWriter::new(File::create(path)?);

    writeln!(
        out,
        "p cnf {} {}",
        encoding.variables,
        encoding.clauses.len()
    )?;

    for clause in &encoding.clauses {
        for literal in clause {
            write!(out, "{literal} ")?;
        }

        writeln!(out, "0")?;
    }

    out.flush()
}

pub fn attempt(table: Table, gates: usize, budget: &Budget, keep: bool) -> anyhow::Result<Attempt> {
    attempt_with(table, gates, budget, keep, &[], &Method::default())
}

fn configuration(preset: Preset) -> Config {
    match preset {
        Preset::Default => Config::Default,
        Preset::Plain => Config::Plain,
        Preset::Sat => Config::Sat,
        Preset::Unsat => Config::Unsat,
    }
}

pub fn attempt_with(
    table: Table,
    gates: usize,
    budget: &Budget,
    keep: bool,
    cuts: &[Cut],
    method: &Method,
) -> anyhow::Result<Attempt> {
    attempt_with_pairs(table, gates, budget, keep, cuts, &[], method)
}

pub fn attempt_with_pairs(
    table: Table,
    gates: usize,
    budget: &Budget,
    keep: bool,
    cuts: &[Cut],
    pair_cuts: &[PairCut],
    method: &Method,
) -> anyhow::Result<Attempt> {
    let began = Instant::now();
    let applied_pairs = if method.breaks.pair_cuts {
        pair_cuts
    } else {
        &[]
    };
    let encoding = Encoding::build_with_pairs(table, gates, cuts, applied_pairs, &method.breaks);

    let stem = format!("{}-{}-{}", table.inputs, table.hex(), gates);
    let (path, file) = if keep {
        std::fs::create_dir_all(&budget.proofs)?;

        let path = budget.proofs.join(format!(
            "{stem}.{}.partial",
            WRITING.fetch_add(1, Ordering::Relaxed)
        ));
        let file = Capped {
            inner: BufWriter::new(File::create(&path)?),
            written: 0,
            overflowed: false,
        };

        (Some(path), Some(file))
    } else {
        (None, None)
    };

    let mut clean = method.clone();

    clean.sanitize();

    let mut solver = CaDiCaL::default();

    solver.set_configuration(configuration(clean.preset))?;

    let _ = solver.set_option("factor", 0);

    for (name, &value) in &clean.options {
        solver.set_option(name, value)?;
    }

    let handle = solver.connect_proof_tracer(
        Tracer {
            checker: Checker::new(&encoding.clauses, file),
            progress: budget.progress.clone(),
        },
        true,
    );

    for clause in &encoding.clauses {
        let lits = clause
            .iter()
            .map(|&variable| literal(variable))
            .collect::<anyhow::Result<Clause>>()?;

        solver.add_clause(lits)?;
    }

    let deadline = began + budget.limit;
    let cancel = budget.cancel.clone();

    solver.attach_terminator(move || {
        if cancel.load(Ordering::Relaxed) || Instant::now() >= deadline {
            ControlSignal::Terminate
        } else {
            ControlSignal::Continue
        }
    });

    let result = solver.solve()?;
    let circuit = match result {
        SolverResult::Sat => Some(encoding.circuit(&solver)?),
        _ => None,
    };

    let tracer = solver
        .disconnect_proof_tracer(handle)
        .map_err(|_| anyhow::anyhow!("the proof tracer was not connected"))?;

    drop(solver);

    let checking = Instant::now();
    let (checked, out) = tracer.checker.finish_with_output();
    let checked: Result<Checked, String> = checked;
    let complete = out.is_some_and(|out| !out.overflowed);
    let check_millis = checking.elapsed().as_millis() as u64;

    let outcome = match result {
        SolverResult::Sat => {
            if let Some(path) = &path {
                let _ = std::fs::remove_file(path);
            }

            let circuit = circuit.expect("a satisfiable result has a circuit");

            if circuit.evaluate() != table || !circuit.well_formed() {
                anyhow::bail!("the solver's circuit does not compute {table}");
            }

            Outcome::Found { circuit }
        }
        SolverResult::Unsat => match checked {
            Ok(checked) => {
                let (bytes, file) = match (&path, complete) {
                    (Some(path), true) => {
                        let bytes = std::fs::metadata(path)?.len();

                        std::fs::rename(path, budget.proofs.join(format!("{stem}.lrat")))?;
                        dimacs(&encoding, &budget.proofs.join(format!("{stem}.cnf")))?;

                        (bytes, Some(stem.clone()))
                    }
                    (Some(path), false) => {
                        let _ = std::fs::remove_file(path);

                        (0, None)
                    }
                    (None, _) => (0, None),
                };

                Outcome::Impossible {
                    proof: Proof {
                        lemmas: checked.lemmas,
                        hints: checked.hints,
                        bytes,
                        check_millis,
                        file,
                    },
                }
            }
            Err(error) => {
                if let Some(path) = &path {
                    let _ = std::fs::remove_file(path);
                }

                Outcome::Unknown {
                    reason: format!("the solver said no, but its proof failed: {error}"),
                }
            }
        },
        SolverResult::Interrupted => {
            if let Some(path) = &path {
                let _ = std::fs::remove_file(path);
            }

            Outcome::Unknown {
                reason: if budget.cancel.load(Ordering::Relaxed) {
                    "cancelled".into()
                } else {
                    format!("no answer within {} s", budget.limit.as_secs())
                },
            }
        }
    };

    Ok(Attempt {
        gates,
        variables: encoding.variables,
        clauses: encoding.clauses.len(),
        millis: began.elapsed().as_millis() as u64,
        outcome,
        cuts: cuts.to_vec(),
        pair_cuts: applied_pairs.to_vec(),
        method: method.version,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exact {
    pub table: Table,
    pub free: Option<Free>,
    pub size: Option<usize>,
    pub lower: usize,
    pub circuit: Option<Circuit>,
    pub attempts: Vec<Attempt>,
}

pub fn exact(table: Table, budget: &Budget, ceiling: usize) -> anyhow::Result<Exact> {
    exact_with(table, budget, ceiling, &[], &Method::default())
}

pub fn exact_with(
    table: Table,
    budget: &Budget,
    ceiling: usize,
    restricted: &[usize],
    method: &Method,
) -> anyhow::Result<Exact> {
    let mut exact = Exact {
        table,
        free: table.free(),
        size: None,
        lower: 0,
        circuit: None,
        attempts: Vec::new(),
    };

    if let Some(free) = exact.free {
        exact.size = Some(0);
        exact.circuit = Some(Circuit {
            inputs: table.inputs,
            gates: Vec::new(),
            output: match free {
                Free::Constant(value) => Output::Constant { value },
                Free::Input { index, negated } => Output::Node {
                    node: index as usize,
                    negated,
                },
            },
        });

        return Ok(exact);
    }

    exact.lower = 1;

    for gates in 1..=ceiling {
        let tried = attempt_with(
            table,
            gates,
            budget,
            false,
            &cuts(gates, restricted),
            method,
        )?;
        let outcome = tried.outcome.clone();

        exact.attempts.push(tried);

        match outcome {
            Outcome::Impossible { .. } => exact.lower = gates + 1,
            Outcome::Found { circuit } => {
                exact.size = Some(gates);
                exact.circuit = Some(circuit);

                break;
            }
            Outcome::Unknown { .. } => break,
        }
    }

    Ok(exact)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget() -> Budget {
        Budget::new(
            Duration::from_secs(60),
            std::env::temp_dir().join(format!("gates-synth-{}", std::process::id())),
        )
    }

    fn size(table: Table) -> usize {
        exact(table, &budget(), 9).unwrap().size.unwrap()
    }

    #[test]
    fn xor_of_n_needs_n_minus_one() {
        for n in 2..=4 {
            assert_eq!(
                size(Table::from_fn(n, |row| row.count_ones() % 2 == 1)),
                n as usize - 1
            );
        }
    }

    #[test]
    fn and_of_n_needs_n_minus_one() {
        for n in 2..=4 {
            let all = (1u32 << n) - 1;

            assert_eq!(size(Table::from_fn(n, |row| row == all)), n as usize - 1);
        }
    }

    #[test]
    fn majority_of_three_needs_four() {
        assert_eq!(size(Table::from_fn(3, |row| row.count_ones() >= 2)), 4);
    }

    #[test]
    fn negated_outputs_are_free() {
        let nand = Table::from_fn(2, |row| row != 3);

        assert_eq!(size(nand), 1);
    }

    #[test]
    fn every_no_carries_a_checked_proof() {
        let majority = Table::from_fn(3, |row| row.count_ones() >= 2);
        let found = exact(majority, &budget(), 9).unwrap();

        assert_eq!(found.attempts.len(), 4);

        for attempt in &found.attempts[..3] {
            assert!(
                matches!(&attempt.outcome, Outcome::Impossible { proof } if proof.lemmas > 0),
                "{attempt:?}"
            );
        }

        assert_eq!(found.circuit.unwrap().evaluate(), majority);
    }

    fn satisfiable(clauses: &[Vec<i32>], variables: i32) -> bool {
        (0u64..1 << variables).any(|bits| {
            clauses.iter().all(|clause| {
                clause.iter().any(|&literal| {
                    let value = bits >> (literal.unsigned_abs() - 1) & 1 == 1;

                    value == (literal > 0)
                })
            })
        })
    }

    #[test]
    fn the_counter_allows_exactly_the_bound() {
        for count in 1..=5usize {
            for bound in 0..=count {
                for pattern in 0u32..1 << count {
                    let mut encoding = Encoding::new(Table::from_fn(2, |row| row == 3), 1);
                    let start = encoding.variables;

                    encoding.clauses.clear();

                    let literals: Vec<i32> = (1..=count as i32).map(|i| start + i).collect();

                    encoding.variables = start + count as i32;
                    encoding.at_most(&literals, bound);

                    for (at, &literal) in literals.iter().enumerate() {
                        encoding.clauses.push(vec![if pattern >> at & 1 == 1 {
                            literal
                        } else {
                            -literal
                        }]);
                    }

                    let shifted: Vec<Vec<i32>> = encoding
                        .clauses
                        .iter()
                        .map(|clause| {
                            clause
                                .iter()
                                .map(|&l| l.signum() * (l.abs() - start))
                                .collect()
                        })
                        .collect();

                    assert_eq!(
                        satisfiable(&shifted, encoding.variables - start),
                        pattern.count_ones() as usize <= bound,
                        "count {count}, bound {bound}, pattern {pattern:b}"
                    );
                }
            }
        }
    }

    #[test]
    fn restriction_cuts_keep_every_answer() {
        let budget = budget();

        for table in [
            Table::from_fn(4, |row| row.count_ones() % 3 == 0),
            Table::from_fn(4, |row| [2, 3, 5, 7, 11, 13].contains(&row)),
            Table::from_fn(4, |row| row.count_ones() >= 2),
        ] {
            let restricted: Vec<usize> = (0..4)
                .map(|input| {
                    [false, true]
                        .iter()
                        .map(|&value| size(table.restrict(input, value)))
                        .max()
                        .unwrap_or(0)
                })
                .collect();

            let plain = exact(table, &budget, 9).unwrap();
            let cut = exact_with(table, &budget, 9, &restricted, &Method::default()).unwrap();

            assert_eq!(plain.size, cut.size, "{table}");
            assert_eq!(cut.circuit.unwrap().evaluate(), table);
        }
    }

    #[test]
    fn a_kept_proof_rechecks_from_its_file() {
        let budget = budget();
        let majority = Table::from_fn(3, |row| row.count_ones() >= 2);
        let tried = attempt(majority, 3, &budget, true).unwrap();

        let Outcome::Impossible { proof } = tried.outcome else {
            panic!("three gates should not be enough: {tried:?}");
        };

        let stem = proof.file.unwrap();
        let encoding = Encoding::new(majority, 3);
        let text = std::fs::read(budget.proofs.join(format!("{stem}.lrat"))).unwrap();
        let rechecked = crate::lrat::check(&encoding.clauses, text.as_slice()).unwrap();

        assert_eq!(rechecked.lemmas, proof.lemmas);
        assert!(budget.proofs.join(format!("{stem}.cnf")).exists());
    }

    #[test]
    fn pair_cuts_and_new_breaks_keep_every_answer() {
        let budget = budget();
        let method = Method {
            breaks: Breaks {
                distinct: true,
                colex: true,
                reapply: true,
                amo: true,
                op_order: true,
                symmetry: true,
                pair_cuts: true,
            },
            ..Method::default()
        };

        for table in [
            Table::from_fn(4, |row| row.count_ones() % 3 == 0),
            Table::from_fn(4, |row| [2, 3, 5, 7, 11, 13].contains(&row)),
            Table::from_fn(4, |row| row.count_ones() >= 2),
        ] {
            let plain = exact(table, &budget, 9).unwrap();
            let mut pairs = Vec::new();

            for i in 0..4u8 {
                for j in i + 1..4u8 {
                    let mut lower = 0;

                    for vi in [false, true] {
                        for vj in [false, true] {
                            let size = exact(table.restrict(j, vj).restrict(i, vi), &budget, 9)
                                .unwrap()
                                .size
                                .unwrap_or(0);

                            lower = lower.max(size);
                        }
                    }

                    if lower > 0 {
                        pairs.push((i as usize, j as usize, lower));
                    }
                }
            }

            let target = plain.size.unwrap();
            let pcuts = pair_cuts(target, &[], &pairs);
            let found = attempt_with_pairs(table, target, &budget, false, &[], &pcuts, &method)
                .unwrap();

            assert!(
                matches!(found.outcome, Outcome::Found { ref circuit } if circuit.evaluate() == table),
                "{table}: {found:?}"
            );

            if target > 1 {
                let smaller = pair_cuts(target - 1, &[], &pairs);
                let nope =
                    attempt_with_pairs(table, target - 1, &budget, false, &[], &smaller, &method)
                        .unwrap();

                assert!(
                    matches!(nope.outcome, Outcome::Impossible { .. }),
                    "{table} at {}: {nope:?}",
                    target - 1
                );
            }
        }
    }
}
