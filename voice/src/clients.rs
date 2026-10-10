use std::{
    collections::{HashMap, VecDeque},
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::http::HeaderMap;

const HOUR: Duration = Duration::from_secs(3_600);

pub struct Clients {
    sessions_each: usize,
    takes_each_hour: usize,
    seen: Mutex<HashMap<String, Client>>,
}

#[derive(Default)]
struct Client {
    sessions: usize,
    takes: VecDeque<Instant>,
}

pub struct Admission {
    who: String,
    clients: Arc<Clients>,
}

impl Clients {
    pub fn new(sessions_each: usize, takes_each_hour: usize) -> Self {
        Self {
            sessions_each,
            takes_each_hour,
            seen: Mutex::default(),
        }
    }

    pub fn admit(self: &Arc<Self>, who: &str) -> Option<Admission> {
        let mut seen = self.seen.lock().ok()?;
        let client = seen.entry(who.to_string()).or_default();

        if client.sessions >= self.sessions_each {
            return None;
        }

        client.sessions += 1;

        Some(Admission {
            who: who.to_string(),
            clients: self.clone(),
        })
    }

    pub fn take(&self, who: &str, now: Instant) -> bool {
        let Ok(mut seen) = self.seen.lock() else {
            return false;
        };
        let client = seen.entry(who.to_string()).or_default();

        client.forget(now);

        if client.takes.len() >= self.takes_each_hour {
            return false;
        }

        client.takes.push_back(now);

        true
    }

    pub fn sweep(&self, now: Instant) {
        if let Ok(mut seen) = self.seen.lock() {
            seen.retain(|_, client| {
                client.forget(now);

                client.sessions > 0 || !client.takes.is_empty()
            });
        }
    }

    fn leave(&self, who: &str) {
        if let Ok(mut seen) = self.seen.lock() {
            if let Some(client) = seen.get_mut(who) {
                client.sessions = client.sessions.saturating_sub(1);
            }
        }
    }
}

impl Client {
    fn forget(&mut self, now: Instant) {
        while self
            .takes
            .front()
            .is_some_and(|taken| now.saturating_duration_since(*taken) >= HOUR)
        {
            self.takes.pop_front();
        }
    }
}

impl Drop for Admission {
    fn drop(&mut self) {
        self.clients.leave(&self.who);
    }
}

pub fn who(headers: &HeaderMap, peer: SocketAddr) -> Option<String> {
    let nearest = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|chain| chain.rsplit(',').next())
        .and_then(|address| address.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| peer.ip())
        .to_canonical();

    public(nearest).then(|| nearest.to_string())
}

fn public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            let [first, second, ..] = address.octets();
            let carrier = first == 100 && second & 0xc0 == 64;

            !(address.is_private()
                || address.is_loopback()
                || address.is_link_local()
                || address.is_unspecified()
                || carrier)
        }
        IpAddr::V6(address) => {
            !(address.is_loopback()
                || address.is_unspecified()
                || address.is_unique_local()
                || address.is_unicast_link_local())
        }
    }
}

pub fn welcome(headers: &HeaderMap, allowed: &[String]) -> bool {
    if allowed.is_empty() {
        return true;
    }

    headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|origin| allowed.iter().any(|known| known == origin))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clients() -> Arc<Clients> {
        Arc::new(Clients::new(2, 3))
    }

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        pairs
            .iter()
            .map(|(name, value)| {
                (
                    axum::http::HeaderName::from_static(name),
                    value.parse().unwrap(),
                )
            })
            .collect()
    }

    #[test]
    fn a_client_gets_only_so_many_sessions_at_once() {
        let clients = clients();
        let first = clients.admit("a");
        let second = clients.admit("a");

        assert!(first.is_some() && second.is_some());
        assert!(clients.admit("a").is_none());
        assert!(clients.admit("b").is_some());

        drop(first);

        assert!(clients.admit("a").is_some());
    }

    #[test]
    fn takes_are_budgeted_per_hour() {
        let clients = clients();
        let start = Instant::now();

        assert!((0..3).all(|_| clients.take("a", start)));
        assert!(!clients.take("a", start + Duration::from_secs(60)));
        assert!(clients.take("b", start));
        assert!(clients.take("a", start + HOUR));
    }

    #[test]
    fn quiet_clients_are_forgotten() {
        let clients = clients();
        let start = Instant::now();

        clients.take("a", start);
        drop(clients.admit("b"));

        let held = clients.admit("c");

        clients.sweep(start + HOUR);

        assert_eq!(clients.seen.lock().unwrap().len(), 1);

        drop(held);
    }

    #[test]
    fn the_nearest_proxy_names_the_client() {
        let peer: SocketAddr = "198.51.100.4:4000".parse().unwrap();
        let forwarded = headers(&[("x-forwarded-for", "6.6.6.6, 203.0.113.7")]);
        let garbled = headers(&[("x-forwarded-for", "6.6.6.6, somebody")]);

        assert_eq!(who(&forwarded, peer).as_deref(), Some("203.0.113.7"));
        assert_eq!(
            who(&HeaderMap::new(), peer).as_deref(),
            Some("198.51.100.4")
        );
        assert_eq!(who(&garbled, peer).as_deref(), Some("198.51.100.4"));
    }

    #[test]
    fn a_load_balancer_is_nobody() {
        let peer: SocketAddr = "10.0.0.9:4000".parse().unwrap();

        for nearest in [
            "10.0.3.17",
            "172.20.1.1",
            "192.168.1.5",
            "100.64.0.9",
            "127.0.0.1",
            "169.254.1.1",
            "::1",
            "fd00::7",
            "fe80::1",
            "::ffff:10.0.3.17",
        ] {
            let forwarded = headers(&[("x-forwarded-for", nearest)]);

            assert_eq!(who(&forwarded, peer), None, "{nearest}");
        }

        assert_eq!(who(&HeaderMap::new(), peer), None);
        assert!(who(&headers(&[("x-forwarded-for", "2001:4860::8888")]), peer).is_some());
        assert!(who(&headers(&[("x-forwarded-for", "100.128.0.1")]), peer).is_some());
    }

    #[test]
    fn only_listed_origins_are_welcome() {
        let allowed = vec!["https://www.example.com".to_string()];

        assert!(welcome(
            &headers(&[("origin", "https://www.example.com")]),
            &allowed
        ));
        assert!(!welcome(
            &headers(&[("origin", "https://evil.example")]),
            &allowed
        ));
        assert!(!welcome(&HeaderMap::new(), &allowed));
        assert!(welcome(&HeaderMap::new(), &[]));
    }
}
