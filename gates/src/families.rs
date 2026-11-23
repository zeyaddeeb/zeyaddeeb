use crate::table::Table;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Explicit {
    pub id: String,
    pub family: &'static str,
    pub title: &'static str,
    pub rule: &'static str,
    pub table: Table,
}

pub const EDGES: [(u32, u32); 6] = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)];

fn edge(row: u32, a: u32, b: u32) -> bool {
    let at = EDGES
        .iter()
        .position(|&(x, y)| (x, y) == (a.min(b), a.max(b)))
        .expect("an edge of the complete graph on four vertices");

    row >> at & 1 == 1
}

fn triangle(row: u32) -> bool {
    [(0, 1, 2), (0, 1, 3), (0, 2, 3), (1, 2, 3)]
        .iter()
        .any(|&(a, b, c)| edge(row, a, b) && edge(row, b, c) && edge(row, a, c))
}

fn connected(row: u32) -> bool {
    let mut reached = 1u32;

    for _ in 0..4 {
        for &(a, b) in &EDGES {
            if row >> EDGES.iter().position(|&e| e == (a, b)).unwrap_or(0) & 1 == 1
                && (reached >> a & 1 == 1 || reached >> b & 1 == 1)
            {
                reached |= 1 << a | 1 << b;
            }
        }
    }

    reached == 0b1111
}

fn matching(row: u32) -> bool {
    [((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))]
        .iter()
        .any(|&((a, b), (c, d))| edge(row, a, b) && edge(row, c, d))
}

fn hamiltonian(row: u32) -> bool {
    [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3]]
        .iter()
        .any(|cycle| (0..4).all(|at| edge(row, cycle[at], cycle[(at + 1) % 4])))
}

fn prime(value: u32) -> bool {
    value >= 2
        && (2..value)
            .take_while(|d| d * d <= value)
            .all(|d| !value.is_multiple_of(d))
}

pub fn catalog() -> Vec<Explicit> {
    let mut all = Vec::new();

    let mut add = |family: &'static str,
                   title: &'static str,
                   rule: &'static str,
                   inputs: u8,
                   f: &dyn Fn(u32) -> bool| {
        all.push(Explicit {
            id: format!("{family}-{inputs}"),
            family,
            title,
            rule,
            table: Table::from_fn(inputs, f),
        });
    };

    for n in 3..=6 {
        add(
            "parity",
            "Parity",
            "An odd number of the inputs are on.",
            n,
            &|row| row.count_ones() % 2 == 1,
        );
    }

    for n in [3, 5] {
        add(
            "majority",
            "Majority",
            "More inputs are on than off.",
            n,
            &|row| row.count_ones() > u32::from(n) / 2,
        );
    }

    for n in 3..=6 {
        add(
            "mod3",
            "Divisible by three",
            "The number of inputs that are on is a multiple of three.",
            n,
            &|row| row.count_ones() % 3 == 0,
        );

        add(
            "prime",
            "Prime",
            "The inputs, read as a binary number, make a prime.",
            n,
            &prime,
        );
    }

    add(
        "product",
        "Middle bit of a product",
        "Bit 1 of a × b, for two 2-bit numbers a and b.",
        4,
        &|row| ((row & 3) * (row >> 2)) >> 1 & 1 == 1,
    );

    add(
        "product",
        "Middle bit of a product",
        "Bit 2 of a × b, for two 3-bit numbers a and b.",
        6,
        &|row| ((row & 7) * (row >> 3)) >> 2 & 1 == 1,
    );

    add(
        "triangle",
        "Triangle",
        "A graph on four vertices, one input per edge, contains a triangle.",
        6,
        &triangle,
    );

    add(
        "connected",
        "Connected",
        "A graph on four vertices, one input per edge, is connected.",
        6,
        &connected,
    );

    add(
        "matching",
        "Perfect matching",
        "A graph on four vertices, one input per edge, pairs every vertex off.",
        6,
        &matching,
    );

    add(
        "hamiltonian",
        "Round trip",
        "A graph on four vertices, one input per edge, has a cycle through all four.",
        6,
        &hamiltonian,
    );

    all
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find(id: &str) -> Table {
        catalog()
            .into_iter()
            .find(|e| e.id == id)
            .unwrap_or_else(|| panic!("{id} is in the catalog"))
            .table
    }

    #[test]
    fn graph_properties_count_the_right_graphs() {
        assert_eq!(find("triangle-6").ones(), 64 - 41);
        assert_eq!(find("connected-6").ones(), 38);
        assert_eq!(find("matching-6").ones(), 37);
        assert_eq!(find("hamiltonian-6").ones(), 10);
    }

    #[test]
    fn primes_below_sixty_four() {
        assert_eq!(find("prime-6").ones(), 18);
        assert_eq!(find("prime-3").ones(), 4);
    }

    #[test]
    fn ids_are_unique() {
        let mut ids: Vec<String> = catalog().into_iter().map(|e| e.id).collect();
        let all = ids.len();

        ids.sort();
        ids.dedup();

        assert_eq!(ids.len(), all);
    }
}
