use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Context};

const DEFAULT_STUN_URL: &str = "stun:stun.l.google.com:19302";

pub struct Network {
    calls: bool,
    ports: Option<Mutex<Vec<u16>>>,
    public_ips: Vec<String>,
    public_host: Option<String>,
    stun: Vec<String>,
}

pub struct Lease {
    port: u16,
    network: Arc<Network>,
}

impl Network {
    pub fn from_env() -> anyhow::Result<Self> {
        let ports = match std::env::var("VOICE_RTC_UDP_PORTS") {
            Ok(range) if !range.trim().is_empty() => Some(span(&range)?),
            _ => None,
        };

        Ok(Self::new(
            switched_on("VOICE_RTC"),
            ports,
            listed("VOICE_RTC_PUBLIC_IPS", ""),
            listed("VOICE_RTC_PUBLIC_HOST", "").into_iter().next(),
            listed("VOICE_STUN_URLS", DEFAULT_STUN_URL),
        ))
    }

    pub fn new(
        calls: bool,
        ports: Option<Vec<u16>>,
        public_ips: Vec<String>,
        public_host: Option<String>,
        stun: Vec<String>,
    ) -> Self {
        Self {
            calls,
            ports: ports.map(Mutex::new),
            public_ips,
            public_host,
            stun,
        }
    }

    pub fn calls(&self) -> bool {
        self.calls
    }

    pub fn lease(self: &Arc<Self>) -> anyhow::Result<Lease> {
        let port = match &self.ports {
            Some(free) => free
                .lock()
                .map_err(|_| anyhow!("the port pool was lost"))?
                .pop()
                .ok_or_else(|| anyhow!("every line is busy right now"))?,
            None => 0,
        };

        Ok(Lease {
            port,
            network: self.clone(),
        })
    }

    pub async fn public_ips(&self) -> Vec<String> {
        let mut ips = self.public_ips.clone();

        if let Some(host) = &self.public_host {
            if let Ok(found) = tokio::net::lookup_host((host.as_str(), 0)).await {
                ips.extend(found.map(|address| address.ip().to_string()));
            }
        }

        ips.sort();
        ips.dedup();

        ips
    }

    pub fn stun(&self) -> &[String] {
        &self.stun
    }
}

impl Lease {
    pub fn address(&self) -> String {
        format!("0.0.0.0:{}", self.port)
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        if let Some(Ok(mut free)) = self.network.ports.as_ref().map(Mutex::lock) {
            free.push(self.port);
        }
    }
}

fn span(range: &str) -> anyhow::Result<Vec<u16>> {
    let (first, last) = range.trim().split_once('-').unwrap_or((range, range));
    let first: u16 = first.trim().parse().context("VOICE_RTC_UDP_PORTS")?;
    let last: u16 = last.trim().parse().context("VOICE_RTC_UDP_PORTS")?;

    if first == 0 || last < first {
        return Err(anyhow!("VOICE_RTC_UDP_PORTS must look like 40000-40015"));
    }

    Ok((first..=last).rev().collect())
}

fn switched_on(variable: &str) -> bool {
    std::env::var(variable).is_ok_and(|value| on(&value))
}

fn on(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "on" | "true" | "1"
    )
}

fn listed(variable: &str, default: &str) -> Vec<String> {
    std::env::var(variable)
        .unwrap_or_else(|_| default.to_string())
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pooled(range: &str) -> Arc<Network> {
        Arc::new(Network::new(
            true,
            Some(span(range).unwrap()),
            vec![],
            None,
            vec![],
        ))
    }

    #[test]
    fn a_range_lists_every_port_lowest_first_out() {
        assert_eq!(span("40000-40002").unwrap(), vec![40002, 40001, 40000]);
        assert_eq!(span(" 3478 ").unwrap(), vec![3478]);
    }

    #[test]
    fn bad_ranges_are_refused() {
        assert!(span("40010-40000").is_err());
        assert!(span("0-4").is_err());
        assert!(span("high").is_err());
    }

    #[test]
    fn without_a_pool_any_port_will_do() {
        let network = Arc::new(Network::new(true, None, vec![], None, vec![]));

        assert_eq!(network.lease().unwrap().address(), "0.0.0.0:0");
        assert_eq!(network.lease().unwrap().address(), "0.0.0.0:0");
    }

    #[test]
    fn a_pool_hands_out_each_port_once() {
        let network = pooled("40000-40001");
        let first = network.lease().unwrap();
        let second = network.lease().unwrap();

        assert_eq!(first.address(), "0.0.0.0:40000");
        assert_eq!(second.address(), "0.0.0.0:40001");
        assert!(network.lease().is_err());
    }

    #[test]
    fn a_dropped_lease_returns_its_port() {
        let network = pooled("40000-40000");

        drop(network.lease().unwrap());

        assert_eq!(network.lease().unwrap().address(), "0.0.0.0:40000");
    }

    #[test]
    fn calls_are_off_unless_switched_on() {
        assert!(["on", "ON", " true ", "1"].iter().all(|value| on(value)));
        assert!(["", "off", "false", "0", "yes"]
            .iter()
            .all(|value| !on(value)));
        assert!(!switched_on("VOICE_TEST_UNSET"));
    }

    #[test]
    fn lists_are_split_and_trimmed() {
        assert_eq!(listed("VOICE_TEST_UNSET", " a , ,b "), vec!["a", "b"]);
        assert!(listed("VOICE_TEST_UNSET", "").is_empty());
    }

    #[tokio::test]
    async fn fixed_addresses_are_reported_once() {
        let network = Network::new(
            true,
            None,
            vec!["203.0.113.7".into(), "203.0.113.7".into()],
            None,
            vec![],
        );

        assert_eq!(network.public_ips().await, vec!["203.0.113.7"]);
    }
}
