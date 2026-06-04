use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct LifeUniverse {
    width: u32,
    height: u32,
    cells: Vec<u8>,
    next_cells: Vec<u8>,
    ages: Vec<u8>,
}

#[wasm_bindgen]
impl LifeUniverse {
    pub fn new(width: u32, height: u32) -> LifeUniverse {
        let size = (width * height) as usize;
        let cells = vec![0; size];
        let next_cells = vec![0; size];
        let ages = vec![0; size];

        LifeUniverse {
            width,
            height,
            cells,
            next_cells,
            ages,
        }
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn cells_ptr(&self) -> *const u8 {
        self.cells.as_ptr()
    }

    pub fn ages_ptr(&self) -> *const u8 {
        self.ages.as_ptr()
    }

    pub fn get_cells(&self) -> Vec<u8> {
        self.cells.clone()
    }

    pub fn get_ages(&self) -> Vec<u8> {
        self.ages.clone()
    }

    fn get_index(&self, row: u32, column: u32) -> usize {
        (row * self.width + column) as usize
    }

    fn live_neighbor_count(&self, row: u32, column: u32) -> u8 {
        let mut count = 0;
        // Wrapping neighbors for an infinite toroidal grid
        let row_minus_1 = if row == 0 { self.height - 1 } else { row - 1 };
        let row_plus_1 = if row == self.height - 1 { 0 } else { row + 1 };
        let col_minus_1 = if column == 0 { self.width - 1 } else { column - 1 };
        let col_plus_1 = if column == self.width - 1 { 0 } else { column + 1 };

        let rows = [row_minus_1, row, row_plus_1];
        let cols = [col_minus_1, column, col_plus_1];

        for &r in &rows {
            for &c in &cols {
                if r == row && c == column {
                    continue;
                }
                let idx = self.get_index(r, c);
                count += self.cells[idx];
            }
        }
        count
    }

    pub fn tick(&mut self) {
        for row in 0..self.height {
            for col in 0..self.width {
                let idx = self.get_index(row, col);
                let cell = self.cells[idx];
                let live_neighbors = self.live_neighbor_count(row, col);

                let next_cell = match (cell, live_neighbors) {
                    (1, x) if x < 2 => 0,
                    (1, 2) | (1, 3) => 1,
                    (1, x) if x > 3 => 0,
                    (0, 3) => 1,
                    (otherwise, _) => otherwise,
                };

                self.next_cells[idx] = next_cell;

                if next_cell == 1 {
                    if cell == 1 {
                        self.ages[idx] = self.ages[idx].saturating_add(1).max(1);
                    } else {
                        self.ages[idx] = 1;
                    }
                } else {
                    self.ages[idx] = 0;
                }
            }
        }

        std::mem::swap(&mut self.cells, &mut self.next_cells);
    }

    pub fn toggle_cell(&mut self, row: u32, col: u32) {
        let idx = self.get_index(row, col);
        if self.cells[idx] == 1 {
            self.cells[idx] = 0;
            self.ages[idx] = 0;
        } else {
            self.cells[idx] = 1;
            self.ages[idx] = 1;
        }
    }

    pub fn set_cell(&mut self, row: u32, col: u32, state: u8) {
        let idx = self.get_index(row, col);
        self.cells[idx] = state;
        if state == 1 {
            if self.ages[idx] == 0 {
                self.ages[idx] = 1;
            }
        } else {
            self.ages[idx] = 0;
        }
    }

    pub fn clear(&mut self) {
        for i in 0..self.cells.len() {
            self.cells[i] = 0;
            self.ages[i] = 0;
        }
    }

    pub fn seed_random(&mut self, probability: f32, seed_val: u32) {
        let mut seed = seed_val;
        for i in 0..self.cells.len() {
            seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
            let val = (seed / 65536) % 32768;
            let rand_val = (val as f32) / 32768.0;
            if rand_val < probability {
                self.cells[i] = 1;
                self.ages[i] = 1;
            } else {
                self.cells[i] = 0;
                self.ages[i] = 0;
            }
        }
    }
}
