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

#[derive(Deserialize, Debug, SurrealValue)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Join,
    Op { op: CrdtOp },
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg<'a> {
    Init { ops: &'a [CrdtOp] },
    Op { op: &'a CrdtOp },
    Error { message: String },
}
