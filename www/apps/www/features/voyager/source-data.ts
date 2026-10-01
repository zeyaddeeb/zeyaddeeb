export const source: Record<string, { line: number; code: string }> = {
	step: {
		line: 34,
		code: "pub fn step(&mut self, dt: f64) -> Pulse {\n    self.error += self.rate * dt;\n\n    if self.error > self.deadband && self.rate > 0.0 {\n        self.fire(-KICK_DEG_S);\n\n        return Pulse::Minus;\n    }\n\n    if self.error < -self.deadband && self.rate < 0.0 {\n        self.fire(KICK_DEG_S);\n\n        return Pulse::Plus;\n    }\n\n    Pulse::Coast\n}",
	},
	fire: {
		line: 52,
		code: "fn fire(&mut self, kick: f64) {\n    self.rate += kick;\n    self.pulses += 1;\n}",
	},
	signal_db: {
		line: 61,
		code: "pub fn signal_db(&self) -> f64 {\n    -12.0 * (self.error / beamwidth()).powi(2)\n}",
	},
	relocate: {
		line: 198,
		code: 'pub fn relocate(&mut self, routine: usize, base: usize) -> Result<u32, String> {\n    let len = LAYOUT[routine].2;\n\n    if base + len > WORDS || !self.fits(base, len) {\n        return Err(format!("{} words do not fit at {base:#06x}", len));\n    }\n\n    let old = self.bases[routine];\n\n    for word in old..old + len {\n        self.owner[word] = FREE;\n    }\n\n    self.bases[routine] = base;\n    self.load(routine);\n\n    Ok(self.patch())\n}',
	},
	fits: {
		line: 217,
		code: "fn fits(&self, base: usize, len: usize) -> bool {\n    (base..base + len).all(|w| self.owner[w] == FREE && !self.is_dead(w))\n}",
	},
	patch: {
		line: 221,
		code: "fn patch(&mut self) -> u32 {\n    let mut patched = 0;\n\n    for &(from, at, to) in CALLS.iter() {\n        let site = self.bases[from] + at;\n        let call = CALL | self.bases[to] as u16;\n\n        if self.memory[site] != call {\n            self.memory[site] = call;\n            patched += 1;\n        }\n    }\n\n    patched\n}",
	},
	healthy: {
		line: 237,
		code: "pub fn healthy(&self) -> bool {\n    let alive = (0..LAYOUT.len()).all(|r| {\n        let base = self.bases[r];\n\n        !(base..base + LAYOUT[r].2).any(|w| self.is_dead(w))\n    });\n\n    let linked = CALLS.iter().all(|&(from, at, to)| {\n        self.memory[self.bases[from] + at] == CALL | self.bases[to] as u16\n    });\n\n    alive && linked\n}",
	},
	frame: {
		line: 251,
		code: "pub fn frame(&mut self, watts: f64, nanotesla: f64) -> Vec<u16> {\n    self.count += 1;\n\n    if !self.healthy() {\n        return vec![STUCK; FRAME_WORDS];\n    }\n\n    let mut frame = vec![0; FRAME_WORDS];\n\n    frame[..2].copy_from_slice(&SYNC);\n    frame[2] = self.count as u16;\n    frame[3] = (watts * 10.0) as u16;\n    frame[4] = (nanotesla * 1000.0) as u16;\n\n    for word in frame.iter_mut().skip(5) {\n        *word = self.noise() as u16;\n    }\n\n    frame\n}",
	},
	command_bits: {
		line: 341,
		code: "pub fn command_bits(opcode: u8, operand: u16) -> Vec<u8> {\n    let word = (u32::from(opcode & 0x3F) << 16) | u32::from(operand);\n    let mut bits: Vec<u8> = (0..22).rev().map(|i| ((word >> i) & 1) as u8).collect();\n    let high = bits[..11].iter().fold(0, |p, b| p ^ b);\n    let low = bits[11..].iter().fold(0, |p, b| p ^ b);\n\n    bits.extend([high, low]);\n\n    bits\n}",
	},
};
