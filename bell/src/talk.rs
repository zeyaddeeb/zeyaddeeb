use crate::clock::now_ns;
use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::mpsc::UnboundedReceiver,
    time::{sleep, timeout},
};
use uuid::Uuid;

pub const WORD: usize = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Word {
    pub k: u32,
    pub dial: u8,
    pub answer: Option<bool>,
    pub dial_ns: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Heard {
    pub word: Word,
    pub heard_ns: i64,
}

impl Word {
    pub fn bytes(self) -> [u8; WORD] {
        let mut out = [0u8; WORD];

        out[..4].copy_from_slice(&self.k.to_be_bytes());
        out[4] = self.dial;
        out[5] = crate::plan::answer_code(self.answer) as u8;
        out[6..].copy_from_slice(&self.dial_ns.to_be_bytes());
        out
    }

    pub fn parse(bytes: &[u8; WORD]) -> Option<Self> {
        Some(Self {
            k: u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
            dial: Some(bytes[4]).filter(|&d| d < 6)?,
            answer: match bytes[5] {
                0 => Some(false),
                1 => Some(true),
                2 => None,
                _ => return None,
            },
            dial_ns: i64::from_be_bytes(bytes[6..].try_into().ok()?),
        })
    }
}

#[derive(Default)]
pub struct Talk {
    waiting: Mutex<HashMap<Uuid, mpsc::Sender<Heard>>>,
}

impl Talk {
    pub fn expect(&self, run: Uuid) -> mpsc::Receiver<Heard> {
        let (tx, rx) = mpsc::channel();

        if let Ok(mut waiting) = self.waiting.lock() {
            waiting.insert(run, tx);
        }

        rx
    }

    pub fn forget(&self, run: Uuid) {
        if let Ok(mut waiting) = self.waiting.lock() {
            waiting.remove(&run);
        }
    }

    fn sender(&self, run: Uuid) -> Option<mpsc::Sender<Heard>> {
        self.waiting.lock().ok()?.get(&run).cloned()
    }

    pub async fn listen(self: Arc<Self>, listener: TcpListener) {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };
            let talk = self.clone();

            tokio::spawn(async move { talk.hear(stream).await });
        }
    }

    async fn hear(&self, mut stream: TcpStream) -> Option<()> {
        stream.set_nodelay(true).ok()?;

        let mut id = [0u8; 16];

        timeout(Duration::from_secs(2), stream.read_exact(&mut id))
            .await
            .ok()?
            .ok()?;

        let run = Uuid::from_bytes(id);
        let mut sender = None;

        for _ in 0..40 {
            sender = self.sender(run);

            if sender.is_some() {
                break;
            }

            sleep(Duration::from_millis(50)).await;
        }

        let sender = sender?;
        let mut word = [0u8; WORD];

        loop {
            timeout(Duration::from_secs(10), stream.read_exact(&mut word))
                .await
                .ok()?
                .ok()?;

            let heard_ns = now_ns();
            let word = Word::parse(&word)?;

            sender.send(Heard { word, heard_ns }).ok()?;
        }
    }
}

pub async fn tell(addr: String, run: Uuid, mut words: UnboundedReceiver<Word>) {
    let connected = timeout(Duration::from_secs(2), TcpStream::connect(&addr)).await;
    let Ok(Ok(mut stream)) = connected else {
        tracing::warn!("talk: could not reach {addr}");
        while words.recv().await.is_some() {}
        return;
    };

    if stream.set_nodelay(true).is_err() || stream.write_all(run.as_bytes()).await.is_err() {
        return;
    }

    while let Some(word) = words.recv().await {
        if stream.write_all(&word.bytes()).await.is_err() {
            tracing::warn!("talk: lost {addr}");
            while words.recv().await.is_some() {}
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_survive_the_wire() {
        let word = Word {
            k: 1_234,
            dial: 4,
            answer: Some(true),
            dial_ns: 1_761_955_200_123_456_789,
        };

        assert_eq!(Word::parse(&word.bytes()), Some(word));
    }

    #[tokio::test]
    async fn a_told_word_reaches_the_waiting_run() {
        let talk = Arc::new(Talk::default());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();

        tokio::spawn(talk.clone().listen(listener));

        let run = Uuid::new_v4();
        let heard = talk.expect(run);
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

        tokio::spawn(tell(addr, run, rx));

        let word = Word {
            k: 3,
            dial: 2,
            answer: Some(false),
            dial_ns: 99,
        };

        tx.send(word).unwrap();

        let got = tokio::task::spawn_blocking(move || heard.recv_timeout(Duration::from_secs(3)))
            .await
            .unwrap()
            .unwrap();

        assert_eq!(got.word, word);
    }
}
