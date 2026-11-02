# bell

Stations and dealer for Minus One Eighth (`/experiments/minus-one-eighth`). One binary runs in every cluster:

- `8080` station: `GET /hello`, `POST /plan` (streams NDJSON records). Mesh only.
- `7000` talk: the dial a station sends over the mesh when the visitor lets them talk. Mesh only.
- `8081` open: `GET /healthz`, plus `GET /sites` and `POST /runs` when `BELL_DEALER=true` (EKS only, called by www).

| Variable | Meaning |
| --- | --- |
| `BELL_SITE` | `gcp-us-west1`, `gcp-us-east4` or `aws-us-east-1` |
| `BELL_DEALER` | `true` on the cluster that serves www |
| `BELL_NTP` | the cloud's link-local time server; unset means the clock is unmeasured and nothing can be certified |
| `BELL_PEERS` | `site=http://host:port\|host:port,...` overrides the mesh service names |

## Three sites on one machine

```sh
cargo build
PEERS="gcp-us-west1=http://127.0.0.1:4101|127.0.0.1:4111,gcp-us-east4=http://127.0.0.1:4102|127.0.0.1:4112,aws-us-east-1=http://127.0.0.1:4103|127.0.0.1:4113"
BELL_SITE=gcp-us-west1 BELL_STATION_ADDR=127.0.0.1:4101 BELL_TALK_ADDR=127.0.0.1:4111 BELL_OPEN_ADDR=127.0.0.1:4121 BELL_NTP=time.google.com:123 cargo run &
BELL_SITE=gcp-us-east4 BELL_STATION_ADDR=127.0.0.1:4102 BELL_TALK_ADDR=127.0.0.1:4112 BELL_OPEN_ADDR=127.0.0.1:4122 BELL_NTP=time.google.com:123 cargo run &
BELL_SITE=aws-us-east-1 BELL_STATION_ADDR=127.0.0.1:4103 BELL_TALK_ADDR=127.0.0.1:4113 BELL_OPEN_ADDR=127.0.0.1:3008 BELL_DEALER=true BELL_PEERS="$PEERS" BELL_NTP=time.google.com:123 cargo run &
```

www reads the dealer from `BELL_BACKEND_URL` (default `http://127.0.0.1:3008`). Public NTP over the internet gives bounds of several milliseconds, so locally the referee will say the clocks are too loose to certify; in the clusters the link-local servers are sub-millisecond. Every station sits on one machine, so a talk run hears the other dial faster than light could cross 3,605 km, and the page says the stations are not where they claim.
