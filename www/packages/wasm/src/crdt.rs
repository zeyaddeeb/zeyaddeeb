use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug)]
pub struct CharId {
    pub site: u32,
    pub clock: u64,
}

impl Ord for CharId {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.clock
            .cmp(&other.clock)
            .then(self.site.cmp(&other.site))
    }
}

impl PartialOrd for CharId {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct RgaChar {
    id: CharId,
    parent: Option<CharId>,
    deleted: bool,
    value: char,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct InsertOp {
    pub id: CharId,
    pub parent: Option<CharId>,
    pub value: char,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeleteOp {
    pub id: CharId,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CrdtOp {
    Insert(InsertOp),
    Delete(DeleteOp),
}

#[wasm_bindgen]
pub struct RgaDocument {
    site_id: u32,
    clock: u64,
    chars: Vec<RgaChar>,
}

#[wasm_bindgen]
impl RgaDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(site_id: u32) -> RgaDocument {
        RgaDocument {
            site_id,
            clock: 0,
            chars: Vec::new(),
        }
    }

    pub fn insert(&mut self, position: usize, value: &str) -> String {
        let ch = value.chars().next().unwrap_or(' ');
        self.clock += 1;
        let id = CharId {
            site: self.site_id,
            clock: self.clock,
        };
        let parent = if position == 0 {
            None
        } else {
            self.nth_visible(position - 1).map(|c| c.id.clone())
        };
        let op = InsertOp {
            id,
            parent,
            value: ch,
        };
        self.apply_insert_internal(&op);
        serde_json::to_string(&CrdtOp::Insert(op)).unwrap_or_default()
    }

    pub fn delete(&mut self, position: usize) -> Option<String> {
        let id = self.nth_visible(position)?.id.clone();
        let op = DeleteOp { id };
        self.apply_delete_internal(&op);
        Some(serde_json::to_string(&CrdtOp::Delete(op)).unwrap_or_default())
    }

    pub fn apply_remote(&mut self, op_json: &str) -> Result<(), JsValue> {
        let op: CrdtOp = serde_json::from_str(op_json)
            .map_err(|e| JsValue::from_str(&format!("crdt parse error: {e}")))?;
        self.apply_op(op);
        Ok(())
    }

    pub fn apply_batch(&mut self, ops_json: &str) -> Result<(), JsValue> {
        let ops: Vec<CrdtOp> = serde_json::from_str(ops_json)
            .map_err(|e| JsValue::from_str(&format!("crdt batch parse error: {e}")))?;
        for op in ops {
            self.apply_op(op);
        }
        Ok(())
    }

    pub fn text(&self) -> String {
        self.chars
            .iter()
            .filter(|c| !c.deleted)
            .map(|c| c.value)
            .collect()
    }

    pub fn export_ops(&self) -> String {
        let ops: Vec<CrdtOp> = self
            .chars
            .iter()
            .map(|c| {
                if c.deleted {
                    CrdtOp::Delete(DeleteOp { id: c.id.clone() })
                } else {
                    CrdtOp::Insert(InsertOp {
                        id: c.id.clone(),
                        parent: c.parent.clone(),
                        value: c.value,
                    })
                }
            })
            .collect();
        serde_json::to_string(&ops).unwrap_or_default()
    }

    pub fn len(&self) -> usize {
        self.chars.iter().filter(|c| !c.deleted).count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn inspect(&self) -> String {
        let items: Vec<serde_json::Value> = self
            .chars
            .iter()
            .map(|c| {
                serde_json::json!({
                    "site":    c.id.site,
                    "clock":   c.id.clock,
                    "value":   c.value.to_string(),
                    "deleted": c.deleted,
                })
            })
            .collect();
        serde_json::to_string(&items).unwrap_or_default()
    }
}

impl RgaDocument {
    fn apply_op(&mut self, op: CrdtOp) {
        match op {
            CrdtOp::Insert(ins) => self.apply_insert_internal(&ins),
            CrdtOp::Delete(del) => self.apply_delete_internal(&del),
        }
    }

    fn apply_insert_internal(&mut self, op: &InsertOp) {
        if self.chars.iter().any(|c| c.id == op.id) {
            return;
        }

        let start = match &op.parent {
            None => 0,
            Some(pid) => self
                .chars
                .iter()
                .position(|c| &c.id == pid)
                .map(|i| i + 1)
                .unwrap_or(0),
        };

        let mut pos = start;
        while pos < self.chars.len() {
            let c = &self.chars[pos];
            if c.parent == op.parent && c.id > op.id {
                pos += 1;
            } else {
                break;
            }
        }

        self.chars.insert(
            pos,
            RgaChar {
                id: op.id.clone(),
                parent: op.parent.clone(),
                deleted: false,
                value: op.value,
            },
        );

        if op.id.clock > self.clock {
            self.clock = op.id.clock;
        }
    }

    fn apply_delete_internal(&mut self, op: &DeleteOp) {
        if let Some(c) = self.chars.iter_mut().find(|c| c.id == op.id) {
            c.deleted = true;
        }
    }

    fn nth_visible(&self, n: usize) -> Option<&RgaChar> {
        self.chars.iter().filter(|c| !c.deleted).nth(n)
    }
}
