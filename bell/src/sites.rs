use serde::Serialize;

const EARTH_KM: f64 = 6_371.0;
const LIGHT_KM_PER_S: f64 = 299_792.458;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Site {
    pub id: &'static str,
    pub place: &'static str,
    pub cloud: &'static str,
    pub lat: f64,
    pub lon: f64,
    pub spread_km: f64,
}

pub const SITES: [Site; 3] = [
    Site {
        id: "gcp-us-west1",
        place: "The Dalles, Oregon",
        cloud: "GKE us-west1",
        lat: 45.6318,
        lon: -121.2014,
        spread_km: 5.0,
    },
    Site {
        id: "gcp-us-east4",
        place: "Ashburn, Virginia",
        cloud: "GKE us-east4",
        lat: 39.0438,
        lon: -77.4874,
        spread_km: 10.0,
    },
    Site {
        id: "aws-us-east-1",
        place: "Northern Virginia",
        cloud: "EKS us-east-1",
        lat: 39.0438,
        lon: -77.4874,
        spread_km: 60.0,
    },
];

const PAIRS: [[usize; 2]; 3] = [[0, 1], [0, 2], [1, 2]];

pub fn find(id: &str) -> Option<&'static Site> {
    SITES.iter().find(|site| site.id == id)
}

pub fn km(a: &Site, b: &Site) -> f64 {
    let (la, lb) = (a.lat.to_radians(), b.lat.to_radians());
    let dlat = lb - la;
    let dlon = (b.lon - a.lon).to_radians();
    let h = (dlat / 2.0).sin().powi(2) + la.cos() * lb.cos() * (dlon / 2.0).sin().powi(2);

    2.0 * EARTH_KM * h.sqrt().asin()
}

pub fn least_km(a: &Site, b: &Site) -> f64 {
    (km(a, b) - a.spread_km - b.spread_km).max(0.0)
}

pub fn light_ns(km: f64) -> i64 {
    (km / LIGHT_KM_PER_S * 1e9).round() as i64
}

pub fn order(a: &'static Site, b: &'static Site) -> [&'static Site; 2] {
    let rank = |s: &Site| SITES.iter().position(|x| x.id == s.id).unwrap_or(0);

    if (a.lon, rank(a)) <= (b.lon, rank(b)) {
        [a, b]
    } else {
        [b, a]
    }
}

pub fn choose(live: &[&str], asked: Option<&[String; 2]>) -> Option<[&'static Site; 2]> {
    let up = |site: &Site| live.contains(&site.id);

    if let Some([a, b]) = asked {
        let (a, b) = (find(a)?, find(b)?);

        return (a.id != b.id && up(a) && up(b)).then(|| order(a, b));
    }

    PAIRS
        .iter()
        .map(|&[a, b]| (&SITES[a], &SITES[b]))
        .find(|(a, b)| up(a) && up(b))
        .map(|(a, b)| order(a, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oregon_and_ashburn_are_twelve_light_milliseconds_apart() {
        let d = km(&SITES[0], &SITES[1]);

        assert!((d - 3_620.0).abs() < 5.0, "{d}");
        assert!((light_ns(d) - 12_076_000).abs() < 20_000);
        assert!(least_km(&SITES[0], &SITES[1]) > 3_600.0);
    }

    #[test]
    fn the_two_virginias_cannot_be_told_apart() {
        assert_eq!(least_km(&SITES[1], &SITES[2]), 0.0);
    }

    #[test]
    fn prefers_the_widest_live_pair_and_puts_west_first() {
        let pair = choose(&["aws-us-east-1", "gcp-us-east4", "gcp-us-west1"], None).unwrap();

        assert_eq!(pair.map(|s| s.id), ["gcp-us-west1", "gcp-us-east4"]);

        let pair = choose(&["aws-us-east-1", "gcp-us-west1"], None).unwrap();

        assert_eq!(pair.map(|s| s.id), ["gcp-us-west1", "aws-us-east-1"]);

        let pair = choose(&["aws-us-east-1", "gcp-us-east4"], None).unwrap();

        assert_eq!(pair.map(|s| s.id), ["gcp-us-east4", "aws-us-east-1"]);
        assert!(choose(&["gcp-us-east4"], None).is_none());
    }

    #[test]
    fn honors_an_asked_pair_only_when_both_are_live() {
        let asked = ["gcp-us-east4".to_string(), "aws-us-east-1".to_string()];

        assert!(choose(&["gcp-us-west1", "gcp-us-east4"], Some(&asked)).is_none());
        assert_eq!(
            choose(&["gcp-us-east4", "aws-us-east-1"], Some(&asked)).map(|p| p.map(|s| s.id)),
            Some(["gcp-us-east4", "aws-us-east-1"])
        );
    }
}
