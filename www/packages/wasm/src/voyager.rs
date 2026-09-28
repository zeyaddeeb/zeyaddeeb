use wasm_bindgen::prelude::*;

const BEAMWIDTH_DEG: f64 = 0.6;
const KICK_DEG_S: f64 = 1.0e-4;

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Pulse {
    Coast = 0,
    Plus = 1,
    Minus = 2,
}

#[wasm_bindgen]
pub struct Aacs {
    error: f64,
    rate: f64,
    deadband: f64,
    pulses: u32,
}

#[wasm_bindgen]
impl Aacs {
    #[wasm_bindgen(constructor)]
    pub fn new(deadband: f64) -> Aacs {
        Aacs {
            error: 0.0,
            rate: KICK_DEG_S / 2.0,
            deadband,
            pulses: 0,
        }
    }

    pub fn step(&mut self, dt: f64) -> Pulse {
        self.error += self.rate * dt;
        if self.error > self.deadband && self.rate > 0.0 {
            self.fire(-KICK_DEG_S);
            return Pulse::Minus;
        }
        if self.error < -self.deadband && self.rate < 0.0 {
            self.fire(KICK_DEG_S);
            return Pulse::Plus;
        }
        Pulse::Coast
    }

    fn fire(&mut self, kick: f64) {
        self.rate += kick;
        self.pulses += 1;
    }

    pub fn nudge(&mut self, rate: f64) {
        self.rate += rate;
    }

    pub fn signal_db(&self) -> f64 {
        -12.0 * (self.error / beamwidth()).powi(2)
    }

    pub fn set_deadband(&mut self, deadband: f64) {
        self.deadband = deadband;
    }

    pub fn error(&self) -> f64 {
        self.error
    }

    pub fn rate(&self) -> f64 {
        self.rate
    }

    pub fn pulses(&self) -> u32 {
        self.pulses
    }
}

#[wasm_bindgen]
pub fn beamwidth() -> f64 {
    BEAMWIDTH_DEG
}

#[wasm_bindgen]
pub fn kick() -> f64 {
    KICK_DEG_S
}

pub const WORDS: usize = 8192;
pub const CHIP_WORDS: usize = 256;
pub const DEAD_CHIP: usize = 21;
const CALL: u16 = 0b111 << 13;
const FREE: u8 = 255;
const STUCK: u16 = 0b1010_1010_1010_1010;
const SYNC: [u16; 2] = [0xFAF3, 0x20C4];
const FRAME_WORDS: usize = 12;

const LAYOUT: [(&str, usize, usize); 31] = [
    ("boot", 0, 412),
    ("executive", 412, 488),
    ("interrupts", 900, 196),
    ("clock", 1096, 150),
    ("read_mag", 1246, 330),
    ("read_pws", 1576, 402),
    ("read_crs", 1978, 250),
    ("read_lecp", 2324, 316),
    ("tape_control", 2640, 470),
    ("playback", 3110, 238),
    ("engineering_table", 3348, 360),
    ("science_table", 3708, 400),
    ("golay", 4108, 318),
    ("reed_solomon", 4426, 470),
    ("commutator", 4984, 270),
    ("dump", 5254, 60),
    ("pack_science", 5376, 80),
    ("pack_engineering", 5456, 72),
    ("frame_header", 5528, 56),
    ("frame_sync", 5584, 48),
    ("ccs_link", 5632, 322),
    ("heaters", 5954, 208),
    ("power_monitor", 6214, 274),
    ("fault_watch", 6488, 302),
    ("modes", 6790, 256),
    ("rates", 7086, 198),
    ("buffers", 7284, 256),
    ("constants", 7564, 180),
    ("patch_log", 7744, 136),
    ("checksum", 7880, 104),
    ("spare_table", 7984, 188),
];

const CALLS: [(usize, usize, usize); 14] = [
    (1, 40, 16),
    (1, 88, 17),
    (14, 12, 18),
    (14, 30, 19),
    (16, 6, 4),
    (16, 22, 5),
    (16, 41, 6),
    (16, 60, 7),
    (17, 9, 22),
    (17, 33, 21),
    (18, 14, 3),
    (18, 40, 13),
    (19, 20, 12),
    (20, 100, 18),
];

#[wasm_bindgen]
pub struct Fds {
    memory: Vec<u16>,
    owner: Vec<u8>,
    bases: Vec<usize>,
    dead: bool,
    count: u32,
    seed: u32,
}

#[wasm_bindgen]
impl Fds {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Fds {
        let mut fds = Fds {
            memory: vec![0; WORDS],
            owner: vec![FREE; WORDS],
            bases: LAYOUT.iter().map(|&(_, base, _)| base).collect(),
            dead: false,
            count: 0,
            seed: 0x5EED,
        };
        for routine in 0..LAYOUT.len() {
            fds.load(routine);
        }
        fds.patch();
        fds
    }

    fn load(&mut self, routine: usize) {
        let (_, _, len) = LAYOUT[routine];
        let base = self.bases[routine];
        for offset in 0..len {
            self.memory[base + offset] = listing(routine, offset);
            self.owner[base + offset] = routine as u8;
        }
    }

    pub fn fail(&mut self) {
        self.dead = true;
    }

    pub fn relocate(&mut self, routine: usize, base: usize) -> Result<u32, String> {
        let len = LAYOUT[routine].2;
        if base + len > WORDS || !self.fits(base, len) {
            return Err(format!("{} words do not fit at {base:#06x}", len));
        }
        let old = self.bases[routine];
        for word in old..old + len {
            self.owner[word] = FREE;
        }
        self.bases[routine] = base;
        self.load(routine);
        Ok(self.patch())
    }

    fn fits(&self, base: usize, len: usize) -> bool {
        (base..base + len).all(|w| self.owner[w] == FREE && !self.is_dead(w))
    }

    fn patch(&mut self) -> u32 {
        let mut patched = 0;
        for &(from, at, to) in CALLS.iter() {
            let site = self.bases[from] + at;
            let call = CALL | self.bases[to] as u16;
            if self.memory[site] != call {
                self.memory[site] = call;
                patched += 1;
            }
        }
        patched
    }

    pub fn healthy(&self) -> bool {
        let alive = (0..LAYOUT.len()).all(|r| {
            let base = self.bases[r];
            !(base..base + LAYOUT[r].2).any(|w| self.is_dead(w))
        });
        let linked = CALLS.iter().all(|&(from, at, to)| {
            self.memory[self.bases[from] + at] == CALL | self.bases[to] as u16
        });
        alive && linked
    }

    pub fn frame(&mut self, watts: f64, nanotesla: f64) -> Vec<u16> {
        self.count += 1;
        if !self.healthy() {
            return vec![STUCK; FRAME_WORDS];
        }
        let mut frame = vec![0; FRAME_WORDS];
        frame[..2].copy_from_slice(&SYNC);
        frame[2] = self.count as u16;
        frame[3] = (watts * 10.0) as u16;
        frame[4] = (nanotesla * 1000.0) as u16;
        for word in frame.iter_mut().skip(5) {
            *word = self.noise() as u16;
        }
        frame
    }

    fn is_dead(&self, word: usize) -> bool {
        self.dead && word / CHIP_WORDS == DEAD_CHIP
    }

    fn noise(&mut self) -> u32 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        self.seed
    }

    pub fn peek(&mut self, word: usize) -> u16 {
        if self.is_dead(word) {
            return self.noise() as u16;
        }
        self.memory[word]
    }

    pub fn owners(&self) -> Vec<u8> {
        self.owner.clone()
    }

    pub fn base(&self, routine: usize) -> usize {
        self.bases[routine]
    }
}

impl Default for Fds {
    fn default() -> Self {
        Fds::new()
    }
}

fn listing(routine: usize, offset: usize) -> u16 {
    let mut x = (routine as u32 + 1).wrapping_mul(2_654_435_761) ^ (offset as u32 + 1);
    x ^= x >> 15;
    x = x.wrapping_mul(0x2C1B_3C6D);
    x ^= x >> 12;
    (x as u16) & !CALL
}

#[wasm_bindgen]
pub fn routine_count() -> usize {
    LAYOUT.len()
}

#[wasm_bindgen]
pub fn routine_name(routine: usize) -> String {
    LAYOUT[routine].0.to_string()
}

#[wasm_bindgen]
pub fn routine_len(routine: usize) -> usize {
    LAYOUT[routine].2
}

#[wasm_bindgen]
pub fn calls() -> Vec<u32> {
    CALLS
        .iter()
        .flat_map(|&(from, at, to)| [from as u32, at as u32, to as u32])
        .collect()
}

#[wasm_bindgen]
pub fn command_bits(opcode: u8, operand: u16) -> Vec<u8> {
    let word = (u32::from(opcode & 0x3F) << 16) | u32::from(operand);
    let mut bits: Vec<u8> = (0..22).rev().map(|i| ((word >> i) & 1) as u8).collect();
    let high = bits[..11].iter().fold(0, |p, b| p ^ b);
    let low = bits[11..].iter().fold(0, |p, b| p ^ b);
    bits.extend([high, low]);
    bits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_fits_in_memory() {
        let mut end = 0;
        for &(_, base, len) in LAYOUT.iter() {
            assert!(base >= end);
            end = base + len;
        }
        assert!(end <= WORDS);
    }

    #[test]
    fn dead_chip_holds_four_routines() {
        let inside: Vec<_> = LAYOUT
            .iter()
            .filter(|&&(_, base, len)| {
                base / CHIP_WORDS == DEAD_CHIP || (base + len - 1) / CHIP_WORDS == DEAD_CHIP
            })
            .map(|&(name, _, _)| name)
            .collect();
        assert_eq!(
            inside,
            [
                "pack_science",
                "pack_engineering",
                "frame_header",
                "frame_sync"
            ]
        );
    }

    #[test]
    fn failure_sticks_the_frame_and_relocation_fixes_it() {
        let mut fds = Fds::new();
        assert!(fds.healthy());
        fds.fail();
        assert_eq!(fds.frame(220.0, 0.5)[0], STUCK);
        assert_eq!(fds.relocate(16, 2228), Ok(5));
        fds.relocate(17, 4896).unwrap();
        fds.relocate(18, 5314).unwrap();
        assert!(!fds.healthy());
        fds.relocate(19, 6162).unwrap();
        assert!(fds.healthy());
        assert_eq!(fds.frame(220.0, 0.5)[..2], SYNC);
    }

    #[test]
    fn a_greedy_move_can_strand_a_routine() {
        let mut fds = Fds::new();
        fds.fail();
        fds.relocate(18, 2228).unwrap();
        fds.relocate(16, 4896).unwrap();
        for gap in [5314, 6162, 7046, 7540, 8172] {
            assert!(fds.relocate(17, gap).is_err());
        }
    }

    #[test]
    fn pulses_hold_the_deadband() {
        let mut aacs = Aacs::new(0.1);
        for _ in 0..200_000 {
            aacs.step(1.0);
            assert!(aacs.error().abs() < 0.1 + KICK_DEG_S * 2.0);
        }
        assert!(aacs.pulses() > 0);
    }

    #[test]
    fn command_has_two_parity_bits() {
        assert_eq!(command_bits(0x2A, 0xBEEF).len(), 24);
    }
}
