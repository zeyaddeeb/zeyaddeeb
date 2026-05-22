use anyhow::Result;
use serde::{Deserialize, Serialize};
use surrealdb::types::SurrealValue;
use surrealdb::{engine::local::Mem, Surreal};

use crate::crdt::CrdtOp;

#[derive(Serialize, Deserialize, Debug, SurrealValue)]
struct OpRecord {
    doc_id: String,
    seq: Option<u64>,
    op: CrdtOp,
}

pub type Db = Surreal<surrealdb::engine::local::Db>;

pub async fn connect() -> Result<Db> {
    let db = Surreal::new::<Mem>(()).await?;
    db.use_ns("crdt").use_db("collab").await?;

    db.query(
        "DEFINE TABLE IF NOT EXISTS ops SCHEMALESS;
         DEFINE INDEX IF NOT EXISTS ops_doc ON ops FIELDS doc_id;",
    )
    .await?;

    Ok(db)
}

pub async fn append_op(db: &Db, doc_id: &str, seq: u64, op: &CrdtOp) -> Result<()> {
    db.create::<Option<OpRecord>>("ops")
        .content(OpRecord {
            doc_id: doc_id.to_owned(),
            seq: Some(seq),
            op: op.clone(),
        })
        .await?;
    Ok(())
}

pub async fn load_ops(db: &Db, doc_id: &str) -> Result<Vec<CrdtOp>> {
    let mut result = db
        .query("SELECT * FROM ops WHERE doc_id = $doc_id ORDER BY seq ASC")
        .bind(("doc_id", doc_id.to_owned()))
        .await?;

    let mut records: Vec<OpRecord> = result.take(0)?;
    records.sort_by_key(|record| record.seq.unwrap_or(0));
    Ok(records.into_iter().map(|r| r.op).collect())
}
