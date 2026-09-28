mod records;

pub use records::*;

use anyhow::Result;
use surrealdb::{
    engine::any::{self, Any},
    opt::auth::Root,
    types::SurrealValue,
    Surreal,
};

const SCHEMA: &str = include_str!("schema.surql");

#[derive(Clone)]
pub struct Store {
    db: Surreal<Any>,
}

#[derive(Debug, Clone, SurrealValue)]
struct Key {
    key: String,
}

#[derive(Debug, Clone, SurrealValue)]
struct Hit {
    number: u64,
    score: f64,
}

impl Store {
    pub async fn connect(url: &str, credentials: Option<(String, String)>) -> Result<Self> {
        let db = any::connect(url).await?;
        if let Some((username, password)) = credentials {
            db.signin(Root { username, password }).await?;
        }
        db.use_ns("proofs").use_db("agent").await?;
        db.query(SCHEMA).await?.check()?;
        Ok(Store { db })
    }

    pub async fn claim(&self, holder: &str, seconds: u64) -> Result<bool> {
        let mut response = self
            .db
            .query(
                "{
                    LET $lease = (SELECT * FROM ONLY agent:lease);
                    LET $free = $lease = NONE OR $lease.holder = $holder OR $lease.until < time::now();
                    IF $free { UPSERT agent:lease CONTENT { holder: $holder, until: time::now() + <duration> $ttl }; };
                    RETURN $free;
                 }",
            )
            .bind(("holder", holder.to_string()))
            .bind(("ttl", format!("{seconds}s")))
            .await?
            .check()?;
        Ok(response.take::<Option<bool>>(0)?.unwrap_or(false))
    }

    pub async fn state(&self) -> Result<Option<AgentState>> {
        Ok(self.db.select(("agent", "state")).await?)
    }

    pub async fn save_state(&self, state: &AgentState) -> Result<()> {
        let _: Option<AgentState> = self
            .db
            .upsert(("agent", "state"))
            .content(state.clone())
            .await?;
        Ok(())
    }

    pub async fn node(&self, key: &str) -> Result<Option<Node>> {
        Ok(self.db.select(("node", key)).await?)
    }

    pub async fn put_node(&self, node: &Node) -> Result<()> {
        let mut node = node.clone();
        node.refresh();
        let _: Option<Node> = self
            .db
            .upsert(("node", node.key.clone()))
            .content(node)
            .await?;
        Ok(())
    }

    pub async fn insert_missing(&self, node: &Node) -> Result<bool> {
        if self.node(&node.key).await?.is_some() {
            return Ok(false);
        }
        self.put_node(node).await?;
        Ok(true)
    }

    pub async fn nodes(&self) -> Result<Vec<Node>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM node ORDER BY updated DESC LIMIT 400")
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn nodes_where(&self, front: &str, trust: Trust, limit: usize) -> Result<Vec<Node>> {
        let mut response = self
            .db
            .query(
                "SELECT * OMIT id FROM node WHERE front = $front AND trust = $trust
                 ORDER BY updated DESC LIMIT $limit",
            )
            .bind(("front", front.to_string()))
            .bind(("trust", trust))
            .bind(("limit", limit as i64))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn recall(&self, query: &str, limit: usize) -> Result<Vec<Node>> {
        let mut response = self
            .db
            .query(
                "SELECT key, search::score(1) AS score FROM node WHERE text @1,OR@ $query
                 ORDER BY score DESC LIMIT $limit",
            )
            .bind(("query", query.to_string()))
            .bind(("limit", limit as i64))
            .await?;
        let keys: Vec<Key> = response.take(0)?;
        let mut nodes = Vec::with_capacity(keys.len());
        for Key { key } in keys {
            if let Some(node) = self.node(&key).await? {
                nodes.push(node);
            }
        }
        Ok(nodes)
    }

    pub async fn link(&self, link: &Link) -> Result<bool> {
        let mut existing = self
            .db
            .query("SELECT from FROM link WHERE from = $from AND to = $to AND relation = $relation")
            .bind(("from", link.from.clone()))
            .bind(("to", link.to.clone()))
            .bind(("relation", link.relation))
            .await?;
        let found: Vec<surrealdb::types::Value> = existing.take(0)?;
        if !found.is_empty() {
            return Ok(false);
        }
        self.db
            .query(
                "RELATE (type::record('node', $from))->link->(type::record('node', $to))
                 CONTENT { from: $from, to: $to, relation: $relation, episode: $episode }",
            )
            .bind(("from", link.from.clone()))
            .bind(("to", link.to.clone()))
            .bind(("relation", link.relation))
            .bind(("episode", link.episode as i64))
            .await?
            .check()?;
        Ok(true)
    }

    pub async fn links(&self) -> Result<Vec<Link>> {
        let mut response = self
            .db
            .query("SELECT from, to, relation, episode FROM link")
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn put_episode(&self, episode: &Episode) -> Result<()> {
        let text = [
            episode.front.as_str(),
            &episode.objective,
            &episode.prediction,
            &episode.summary,
            &episode.next,
        ]
        .join(" ");
        self.db
            .query(
                "UPSERT type::record('episode', $number) CONTENT $episode;
                 UPDATE type::record('episode', $number) SET text = $text;",
            )
            .bind(("number", episode.number as i64))
            .bind(("episode", episode.clone()))
            .bind(("text", text))
            .await?
            .check()?;
        Ok(())
    }

    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<Episode>> {
        if let Ok(number) = query.trim().trim_start_matches('#').parse::<u64>() {
            return Ok(self.episode(number).await?.into_iter().collect());
        }
        let mut response = self
            .db
            .query(
                "SELECT number, search::score(1) AS score FROM episode WHERE text @1,OR@ $query
                 ORDER BY score DESC LIMIT $limit;
                 SELECT episode AS number, search::score(1) AS score FROM turn WHERE text @1,OR@ $query
                 ORDER BY score DESC LIMIT $limit;",
            )
            .bind(("query", query.to_string()))
            .bind(("limit", (limit * 2) as i64))
            .await?;
        let mut hits: Vec<Hit> = response.take(0)?;
        hits.extend(response.take::<Vec<Hit>>(1)?);
        hits.sort_by(|a, b| b.score.total_cmp(&a.score));
        let mut numbers: Vec<u64> = Vec::new();
        for hit in hits {
            if !numbers.contains(&hit.number) {
                numbers.push(hit.number);
            }
        }
        let mut found = Vec::new();
        for number in numbers.into_iter().take(limit) {
            if let Some(episode) = self.episode(number).await? {
                found.push(episode);
            }
        }
        Ok(found)
    }

    pub async fn episode(&self, number: u64) -> Result<Option<Episode>> {
        Ok(self.db.select(("episode", number as i64)).await?)
    }

    pub async fn episodes(&self, limit: usize) -> Result<Vec<Episode>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM episode ORDER BY number DESC LIMIT $limit")
            .bind(("limit", limit as i64))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn episodes_before(&self, before: u64, limit: usize) -> Result<Vec<Episode>> {
        let mut response = self
            .db
            .query(
                "SELECT * OMIT id FROM episode WHERE number < $before
                 ORDER BY number DESC LIMIT $limit",
            )
            .bind(("before", before as i64))
            .bind(("limit", limit as i64))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn episodes_on(&self, front: &str, limit: usize) -> Result<Vec<Episode>> {
        let mut response = self
            .db
            .query(
                "SELECT * OMIT id FROM episode WHERE front = $front
                 ORDER BY number DESC LIMIT $limit",
            )
            .bind(("front", front.to_string()))
            .bind(("limit", limit as i64))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn put_turn(&self, turn: &Turn) -> Result<()> {
        let mut text = format!("{} {}", turn.thought, turn.said);
        for call in &turn.calls {
            text.push(' ');
            text.push_str(&call.summary);
        }
        self.db
            .query(
                "UPSERT type::record('turn', $id) CONTENT $turn;
                 UPDATE type::record('turn', $id) SET text = $text;",
            )
            .bind(("id", format!("{}-{}", turn.episode, turn.index)))
            .bind(("turn", turn.clone()))
            .bind(("text", text))
            .await?
            .check()?;
        Ok(())
    }

    pub async fn turns(&self, episode: u64) -> Result<Vec<Turn>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM turn WHERE episode = $episode ORDER BY index")
            .bind(("episode", episode as i64))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn forget_turns_before(&self, episode: u64) -> Result<()> {
        self.db
            .query("DELETE turn WHERE episode < $episode")
            .bind(("episode", episode as i64))
            .await?
            .check()?;
        Ok(())
    }

    pub async fn put_stretch(&self, stretch: &Stretch) -> Result<()> {
        let _: Option<Stretch> = self.db.create("stretch").content(stretch.clone()).await?;
        Ok(())
    }

    pub async fn stretches(&self) -> Result<Vec<Stretch>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM stretch ORDER BY from")
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn put_probe(&self, probe: &Probe) -> Result<()> {
        let _: Option<Probe> = self.db.create("probe").content(probe.clone()).await?;
        Ok(())
    }

    pub async fn probes(&self) -> Result<Vec<Probe>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM probe ORDER BY t_from")
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn put_lemma(&self, lemma: &Lemma) -> Result<()> {
        let _: Option<Lemma> = self
            .db
            .upsert(("lemma", lemma.name.clone()))
            .content(lemma.clone())
            .await?;
        Ok(())
    }

    pub async fn lemmas(&self) -> Result<Vec<Lemma>> {
        let mut response = self
            .db
            .query("SELECT * OMIT id FROM lemma ORDER BY episode")
            .await?;
        Ok(response.take(0)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn store() -> Store {
        Store::connect("mem://", None).await.unwrap()
    }

    #[tokio::test]
    async fn nodes_round_trip_and_recall_by_text() {
        let store = store().await;
        let mut robin = Node::new(
            "robin",
            Kind::Equivalence,
            Trust::Literature,
            "Robin's inequality",
            "RH holds exactly when sigma(n) < e^gamma n log log n for every n above 5040.",
        );
        robin.front = "divisors".into();
        store.put_node(&robin).await.unwrap();
        let mertens = Node::new(
            "mertens",
            Kind::Equivalence,
            Trust::Literature,
            "Mertens growth",
            "RH holds exactly when the Mertens function grows no faster than x to the one half plus epsilon.",
        );
        store.put_node(&mertens).await.unwrap();
        assert!(!store.insert_missing(&mertens).await.unwrap());

        let back = store.node("robin").await.unwrap().unwrap();
        assert_eq!(back.trust, Trust::Literature);
        assert_eq!(back.kind, Kind::Equivalence);

        let found = store.recall("divisor sigma inequality", 5).await.unwrap();
        assert_eq!(
            found.first().map(|n| n.key.as_str()),
            Some("robin"),
            "{found:?}"
        );
        let found = store.recall("Mertens function", 5).await.unwrap();
        assert_eq!(found.first().map(|n| n.key.as_str()), Some("mertens"));

        let on = store
            .nodes_where("divisors", Trust::Literature, 5)
            .await
            .unwrap();
        assert_eq!(on.len(), 1);
    }

    #[tokio::test]
    async fn links_are_graph_edges_without_duplicates() {
        let store = store().await;
        for key in ["a", "b"] {
            store
                .put_node(&Node::new(key, Kind::Theorem, Trust::Mathlib, key, key))
                .await
                .unwrap();
        }
        let link = Link {
            from: "a".into(),
            to: "b".into(),
            relation: Relation::Implies,
            episode: 1,
        };
        assert!(store.link(&link).await.unwrap());
        assert!(!store.link(&link).await.unwrap());
        let links = store.links().await.unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].relation, Relation::Implies);
    }

    #[tokio::test]
    async fn memory_on_disk_survives_a_restart() {
        let dir = std::env::temp_dir().join(format!("proofs-agent-{}", std::process::id()));
        let url = format!("surrealkv://{}", dir.display());
        {
            let store = Store::connect(&url, None).await.unwrap();
            store
                .put_node(&Node::new(
                    "kept",
                    Kind::Insight,
                    Trust::Conjectured,
                    "Kept",
                    "Across restarts.",
                ))
                .await
                .unwrap();
        }
        let mut reopened = None;
        for _ in 0..50 {
            if let Ok(store) = Store::connect(&url, None).await {
                reopened = Some(store);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        let store = reopened.expect("the lock is released after the first store drops");
        assert!(store.node("kept").await.unwrap().is_some());
        drop(store);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn only_one_holder_keeps_the_lease() {
        let store = store().await;
        assert!(store.claim("pod-a", 60).await.unwrap());
        assert!(store.claim("pod-a", 60).await.unwrap());
        assert!(!store.claim("pod-b", 60).await.unwrap());
    }

    #[tokio::test]
    async fn state_episodes_and_turns_persist() {
        let store = store().await;
        assert!(store.state().await.unwrap().is_none());
        let state = AgentState {
            episodes: 3,
            frontier: 1000.0,
            ..Default::default()
        };
        store.save_state(&state).await.unwrap();
        assert_eq!(store.state().await.unwrap().unwrap().episodes, 3);

        for number in 1..=3 {
            store
                .put_episode(&Episode {
                    number,
                    front: "line".into(),
                    ..Default::default()
                })
                .await
                .unwrap();
            store
                .put_turn(&Turn {
                    episode: number,
                    index: 0,
                    thought: if number == 3 {
                        "The Lehmer pair looked fragile.".into()
                    } else {
                        "hm".into()
                    },
                    said: String::new(),
                    calls: Vec::new(),
                    tokens: 10,
                    at: 0,
                })
                .await
                .unwrap();
        }
        let recent = store.episodes(2).await.unwrap();
        assert_eq!(
            recent.iter().map(|e| e.number).collect::<Vec<_>>(),
            vec![3, 2]
        );
        store
            .put_episode(&Episode {
                number: 4,
                front: "divisors".into(),
                summary: "Robin's margin kept shrinking past forty digits.".into(),
                ..Default::default()
            })
            .await
            .unwrap();
        let found = store.search("robin margin", 5).await.unwrap();
        assert_eq!(found.first().map(|e| e.number), Some(4));
        let by_number = store.search("#2", 5).await.unwrap();
        assert_eq!(by_number.first().map(|e| e.number), Some(2));
        let by_thought = store.search("Lehmer", 5).await.unwrap();
        assert_eq!(by_thought.first().map(|e| e.number), Some(3));
        let older = store.episodes_before(3, 5).await.unwrap();
        assert_eq!(
            older.iter().map(|e| e.number).collect::<Vec<_>>(),
            vec![2, 1]
        );
        store.forget_turns_before(3).await.unwrap();
        assert!(store.turns(1).await.unwrap().is_empty());
        assert_eq!(store.turns(3).await.unwrap().len(), 1);
    }
}
