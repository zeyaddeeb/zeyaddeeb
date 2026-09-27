use serde::{Deserialize, Serialize};
use surrealdb::types::SurrealValue;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug, SurrealValue)]
pub struct CharId {
    pub site: u32,
    pub clock: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug, SurrealValue)]
pub struct InsertOp {
    pub id: CharId,
    pub parent: Option<CharId>,
    pub value: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, SurrealValue)]
pub struct DeleteOp {
    pub id: CharId,
}

#[derive(Clone, Serialize, Deserialize, Debug, SurrealValue)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CrdtOp {
    Insert(InsertOp),
    Delete(DeleteOp),
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Join,
    Op { op: CrdtOp },
    Cursor { x: f32, y: f32 },
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg<'a> {
    Init {
        ops: &'a [CrdtOp],
        peer: u32,
        peers: usize,
    },
    Op {
        op: &'a CrdtOp,
    },
    Presence {
        peers: usize,
    },
    Cursor {
        peer: u32,
        x: f32,
        y: f32,
    },
    Leave {
        peer: u32,
    },
    Error {
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    const INSERT_ROOT: &str =
        r#"{"type":"insert","id":{"site":7,"clock":1},"parent":null,"value":"a"}"#;
    const INSERT_CHILD: &str =
        r#"{"type":"insert","id":{"site":7,"clock":2},"parent":{"site":3,"clock":1},"value":"é"}"#;
    const DELETE: &str = r#"{"type":"delete","id":{"site":3,"clock":1}}"#;

    #[test]
    fn insert_matches_wasm_wire_format() {
        let op: CrdtOp = serde_json::from_str(INSERT_ROOT).unwrap();
        let CrdtOp::Insert(ref insert) = op else {
            panic!("expected insert");
        };
        assert_eq!(insert.id, CharId { site: 7, clock: 1 });
        assert!(insert.parent.is_none());
        assert_eq!(insert.value, "a");
        assert_eq!(serde_json::to_string(&op).unwrap(), INSERT_ROOT);

        let op: CrdtOp = serde_json::from_str(INSERT_CHILD).unwrap();
        let CrdtOp::Insert(ref insert) = op else {
            panic!("expected insert");
        };
        assert_eq!(insert.id, CharId { site: 7, clock: 2 });
        assert_eq!(insert.parent, Some(CharId { site: 3, clock: 1 }));
        assert_eq!(insert.value, "é");
        assert_eq!(serde_json::to_string(&op).unwrap(), INSERT_CHILD);
    }

    #[test]
    fn delete_matches_wasm_wire_format() {
        let op: CrdtOp = serde_json::from_str(DELETE).unwrap();
        let CrdtOp::Delete(ref delete) = op else {
            panic!("expected delete");
        };
        assert_eq!(delete.id, CharId { site: 3, clock: 1 });
        assert_eq!(serde_json::to_string(&op).unwrap(), DELETE);
    }

    #[test]
    fn client_op_envelope_wraps_wasm_ops() {
        for fixture in [INSERT_ROOT, INSERT_CHILD, DELETE] {
            let envelope = format!(r#"{{"type":"op","op":{fixture}}}"#);
            let ClientMsg::Op { op } = serde_json::from_str(&envelope).unwrap() else {
                panic!("expected op message");
            };
            assert_eq!(serde_json::to_string(&op).unwrap(), fixture);
        }
    }
}
