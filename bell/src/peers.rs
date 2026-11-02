use crate::sites::{self, Site, SITES};

#[derive(Clone, Debug, PartialEq)]
pub struct Peer {
    pub site: &'static Site,
    pub http: String,
    pub talk: String,
}

pub fn parse(spec: Option<&str>) -> Vec<Peer> {
    let mut peers: Vec<Peer> = SITES
        .iter()
        .map(|site| Peer {
            site,
            http: format!("http://bell-{}:8080", site.id),
            talk: format!("bell-{}:7000", site.id),
        })
        .collect();

    for entry in spec
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|e| !e.is_empty())
    {
        let Some((id, rest)) = entry.split_once('=') else {
            continue;
        };
        let Some((http, talk)) = rest.split_once('|') else {
            continue;
        };
        let Some(site) = sites::find(id) else {
            continue;
        };

        if let Some(peer) = peers.iter_mut().find(|p| p.site.id == site.id) {
            peer.http = http.trim_end_matches('/').to_string();
            peer.talk = talk.to_string();
        }
    }

    peers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_one_mesh_service_per_site() {
        let peers = parse(None);

        assert_eq!(peers.len(), 3);
        assert_eq!(peers[0].http, "http://bell-gcp-us-west1:8080");
        assert_eq!(peers[2].talk, "bell-aws-us-east-1:7000");
    }

    #[test]
    fn overrides_peers_for_local_runs() {
        let peers = parse(Some(
            "gcp-us-east4=http://127.0.0.1:4102/|127.0.0.1:4112, nowhere=x|y",
        ));

        assert_eq!(peers[1].http, "http://127.0.0.1:4102");
        assert_eq!(peers[1].talk, "127.0.0.1:4112");
        assert_eq!(peers[0].http, "http://bell-gcp-us-west1:8080");
    }
}
