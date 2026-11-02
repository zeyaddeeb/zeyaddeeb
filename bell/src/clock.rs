use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::{net::UdpSocket, time::timeout};

const NTP_EPOCH_S: i64 = 2_208_988_800;
const SAMPLES: usize = 4;
pub const UNMEASURED_BOUND_NS: i64 = 5_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Clock {
    pub offset_ns: i64,
    pub bound_ns: i64,
    pub measured: bool,
}

impl Clock {
    pub fn unmeasured() -> Self {
        Self {
            offset_ns: 0,
            bound_ns: UNMEASURED_BOUND_NS,
            measured: false,
        }
    }
}

pub fn now_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0)
}

pub fn to_ntp(ns: i64) -> [u8; 8] {
    let secs = ns.div_euclid(1_000_000_000) + NTP_EPOCH_S;
    let frac = ((ns.rem_euclid(1_000_000_000) as u128) << 32) / 1_000_000_000;
    let mut out = [0u8; 8];

    out[..4].copy_from_slice(&(secs as u32).to_be_bytes());
    out[4..].copy_from_slice(&(frac as u32).to_be_bytes());
    out
}

pub fn from_ntp(bytes: &[u8]) -> i64 {
    let secs = i64::from(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]));
    let frac = u128::from(u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]));

    (secs - NTP_EPOCH_S) * 1_000_000_000 + ((frac * 1_000_000_000) >> 32) as i64
}

fn short(bytes: &[u8]) -> i64 {
    let value = u64::from(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]));

    ((value * 1_000_000_000) >> 16) as i64
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Sample {
    pub offset_ns: i64,
    pub delay_ns: i64,
    pub root_ns: i64,
}

impl Sample {
    pub fn bound_ns(&self) -> i64 {
        self.delay_ns / 2 + self.root_ns
    }
}

pub fn request(sent_ns: i64) -> [u8; 48] {
    let mut packet = [0u8; 48];

    packet[0] = 0b00_100_011;
    packet[40..48].copy_from_slice(&to_ntp(sent_ns));
    packet
}

pub fn read(reply: &[u8], sent: &[u8; 48], t1: i64, t4: i64) -> Option<Sample> {
    if reply.len() < 48 || reply[0] & 0b111 != 4 || reply[1] == 0 || reply[24..32] != sent[40..48] {
        return None;
    }

    let t2 = from_ntp(&reply[32..40]);
    let t3 = from_ntp(&reply[40..48]);
    let root_delay = short(&reply[4..8]);
    let root_dispersion = short(&reply[8..12]);

    Some(Sample {
        offset_ns: ((t2 - t1) + (t3 - t4)) / 2,
        delay_ns: ((t4 - t1) - (t3 - t2)).max(0),
        root_ns: root_delay / 2 + root_dispersion,
    })
}

async fn sample(socket: &UdpSocket) -> Option<Sample> {
    let t1 = now_ns();
    let sent = request(t1);
    let mut reply = [0u8; 68];

    socket.send(&sent).await.ok()?;

    let n = timeout(Duration::from_millis(400), socket.recv(&mut reply))
        .await
        .ok()?
        .ok()?;

    read(&reply[..n], &sent, t1, now_ns())
}

pub async fn measure(server: Option<&str>) -> Clock {
    let Some(server) = server else {
        return Clock::unmeasured();
    };
    let Ok(socket) = UdpSocket::bind("0.0.0.0:0").await else {
        return Clock::unmeasured();
    };

    if timeout(Duration::from_millis(400), socket.connect(server))
        .await
        .map_or(true, |r| r.is_err())
    {
        return Clock::unmeasured();
    }

    let mut best: Option<Sample> = None;

    for _ in 0..SAMPLES {
        if let Some(s) = sample(&socket).await {
            if best.is_none_or(|b| s.delay_ns < b.delay_ns) {
                best = Some(s);
            }
        }
    }

    best.map_or_else(Clock::unmeasured, |s| Clock {
        offset_ns: s.offset_ns,
        bound_ns: s.bound_ns(),
        measured: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ntp_timestamps_round_trip_to_the_nanosecond() {
        for ns in [0, 1_761_955_200_123_456_789, 1_800_000_000_999_999_999] {
            assert!((from_ntp(&to_ntp(ns)) - ns).abs() <= 1);
        }
    }

    #[test]
    fn reads_offset_and_delay_from_a_server_reply() {
        let t1 = 1_761_955_200_000_000_000;
        let sent = request(t1);
        let mut reply = [0u8; 48];

        reply[0] = 0b00_100_100;
        reply[1] = 2;
        reply[4..8].copy_from_slice(&(1u32 << 6).to_be_bytes());
        reply[8..12].copy_from_slice(&(1u32 << 5).to_be_bytes());
        reply[24..32].copy_from_slice(&sent[40..48]);
        reply[32..40].copy_from_slice(&to_ntp(t1 + 3_000_000));
        reply[40..48].copy_from_slice(&to_ntp(t1 + 3_100_000));

        let s = read(&reply, &sent, t1, t1 + 1_100_000).expect("valid reply");

        assert!((s.offset_ns - 2_500_000).abs() <= 2);
        assert!((s.delay_ns - 1_000_000).abs() <= 2);
        assert!((s.root_ns - (976_562 / 2 + 488_281)).abs() <= 2);
    }

    #[test]
    fn rejects_kiss_of_death_and_foreign_replies() {
        let sent = request(5);
        let mut reply = [0u8; 48];

        reply[0] = 0b00_100_100;
        reply[24..32].copy_from_slice(&sent[40..48]);
        assert!(read(&reply, &sent, 5, 6).is_none());

        reply[1] = 1;
        reply[24] ^= 1;
        assert!(read(&reply, &sent, 5, 6).is_none());
    }
}
