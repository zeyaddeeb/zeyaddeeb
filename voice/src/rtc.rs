use std::{
    sync::{Arc, Weak},
    time::{Duration, Instant},
};

use async_trait::async_trait;
use bytes::Bytes;
use rtc::{
    media::Sample,
    media_stream::MediaStreamTrack,
    peer_connection::configuration::media_engine::MIME_TYPE_OPUS,
    rtp_transceiver::rtp_sender::{
        RTCRtpCodec, RTCRtpCodingParameters, RTCRtpEncodingParameters, RtpCodecKind,
    },
};
use tokio::sync::{mpsc, watch};
use tracing::{debug, info, warn};
use webrtc::{
    media_stream::{
        track_local::{static_sample::TrackLocalStaticSample, TrackLocal},
        track_remote::{TrackRemote, TrackRemoteEvent},
    },
    peer_connection::{
        register_default_interceptors, MediaEngine, PeerConnection, PeerConnectionBuilder,
        PeerConnectionEventHandler, RTCConfigurationBuilder, RTCIceCandidateInit, RTCIceServer,
        RTCPeerConnectionIceEvent, RTCPeerConnectionState, RTCSessionDescription, Registry,
    },
    rtp_transceiver::RtpSender,
};

use crate::{
    codec::{Decoder, Encoder, FRAME, FRAME_MS},
    network::{Lease, Network},
    player::{self, Sink},
    protocol::ServerMessage,
    state::Session,
};

const LONGEST_GAP: u16 = 10;
const CLOSING: Duration = Duration::from_secs(5);
const SILENCE_BITS: i32 = 8_000;

pub struct Call {
    peer: Arc<dyn PeerConnection>,
    _lease: Lease,
}

impl Call {
    pub async fn add_ice_candidate(&self, candidate: String) -> anyhow::Result<()> {
        self.peer
            .add_ice_candidate(RTCIceCandidateInit {
                candidate,
                sdp_mid: None,
                sdp_mline_index: None,
                username_fragment: None,
                url: None,
            })
            .await?;

        Ok(())
    }

    pub async fn close(self) {
        match tokio::time::timeout(CLOSING, self.peer.close()).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => warn!("peer connection did not close cleanly: {error}"),
            Err(_) => warn!("peer connection took too long to close; dropping it"),
        }
    }
}

pub async fn accept_offer(
    session: Arc<Session>,
    network: &Arc<Network>,
    sdp: String,
    events: mpsc::Sender<ServerMessage>,
) -> anyhow::Result<String> {
    if let Some(previous) = session.call.lock().await.take() {
        previous.close().await;
    }

    let lease = network.lease()?;
    let (connected, connection) = watch::channel(false);
    let peer = connect(session.clone(), network, &lease, events.clone(), connected).await?;
    let ssrc = uuid::Uuid::new_v4().as_u128() as u32;
    let track = Arc::new(TrackLocalStaticSample::new(Instant::now(), outgoing(ssrc))?);
    let sender = peer.add_track(track.clone() as Arc<dyn TrackLocal>).await?;

    peer.set_remote_description(RTCSessionDescription::offer(sdp)?)
        .await?;

    let answer = peer.create_answer(None).await?;

    peer.set_local_description(answer.clone()).await?;

    let speaker = Speaker {
        track,
        sender,
        ssrc,
        connection,
        silence: silence()?,
    };

    session.listen_through(player::start(speaker, events));
    *session.call.lock().await = Some(Call {
        peer,
        _lease: lease,
    });

    Ok(answer.sdp)
}

async fn connect(
    session: Arc<Session>,
    network: &Network,
    lease: &Lease,
    events: mpsc::Sender<ServerMessage>,
    connected: watch::Sender<bool>,
) -> anyhow::Result<Arc<dyn PeerConnection>> {
    let mut media_engine = MediaEngine::default();

    media_engine.register_default_codecs()?;

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)?;
    let configuration = RTCConfigurationBuilder::new()
        .with_ice_servers(ice_servers(network.stun()))
        .build();
    let handler = Handler {
        session: Arc::downgrade(&session),
        events,
        public: network.public_ips().await,
        connected,
    };

    let peer = PeerConnectionBuilder::new()
        .with_configuration(configuration)
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_handler(Arc::new(handler))
        .with_udp_addrs(vec![lease.address()])
        .build()
        .await?;

    Ok(Arc::new(peer))
}

fn outgoing(ssrc: u32) -> MediaStreamTrack {
    MediaStreamTrack::new(
        "voice".to_owned(),
        "generations".to_owned(),
        "generations".to_owned(),
        RtpCodecKind::Audio,
        vec![RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                ssrc: Some(ssrc),
                ..Default::default()
            },
            codec: RTCRtpCodec {
                mime_type: MIME_TYPE_OPUS.to_owned(),
                clock_rate: 48_000,
                channels: 2,
                sdp_fmtp_line: "minptime=10;useinbandfec=1".to_owned(),
                rtcp_feedback: vec![],
            },
            ..Default::default()
        }],
    )
}

fn ice_servers(urls: &[String]) -> Vec<RTCIceServer> {
    if urls.is_empty() {
        return Vec::new();
    }

    vec![RTCIceServer {
        urls: urls.to_vec(),
        ..Default::default()
    }]
}

struct Speaker {
    track: Arc<TrackLocalStaticSample>,
    sender: Arc<dyn RtpSender>,
    ssrc: u32,
    connection: watch::Receiver<bool>,
    silence: Bytes,
}

impl Speaker {
    async fn write(&self, packet: Bytes) -> anyhow::Result<()> {
        let payload_type = self
            .sender
            .get_parameters()
            .await?
            .rtp_parameters
            .codecs
            .first()
            .map(|codec| codec.payload_type)
            .ok_or_else(|| anyhow::anyhow!("no codec has been negotiated yet"))?;

        self.track
            .sample_writer(self.ssrc, payload_type)
            .write_sample(&Sample {
                data: packet,
                duration: Duration::from_millis(FRAME_MS),
                ..Sample::new(Instant::now())
            })
            .await?;

        Ok(())
    }
}

#[async_trait]
impl Sink for Speaker {
    fn ready(&self) -> bool {
        *self.connection.borrow()
    }

    async fn send(&mut self, packet: &[u8]) -> anyhow::Result<()> {
        self.write(Bytes::copy_from_slice(packet)).await
    }

    async fn rest(&mut self) -> anyhow::Result<()> {
        self.write(self.silence.clone()).await
    }
}

fn silence() -> anyhow::Result<Bytes> {
    Ok(Bytes::from(
        Encoder::new(SILENCE_BITS, 0.0)?.encode(&[0.0; FRAME])?,
    ))
}

struct Handler {
    session: Weak<Session>,
    events: mpsc::Sender<ServerMessage>,
    public: Vec<String>,
    connected: watch::Sender<bool>,
}

fn advertised(candidate: &str, public: &[String]) -> Vec<String> {
    let fields: Vec<&str> = candidate.split(' ').collect();
    let host = fields.windows(2).any(|pair| pair == ["typ", "host"]);

    if public.is_empty() || !host || fields.len() < 6 {
        return vec![candidate.to_string()];
    }

    public
        .iter()
        .map(|address| {
            let mut rewritten = fields.clone();

            rewritten[4] = address;

            rewritten.join(" ")
        })
        .collect()
}

#[async_trait]
impl PeerConnectionEventHandler for Handler {
    async fn on_ice_candidate(&self, event: RTCPeerConnectionIceEvent) {
        match event.candidate.to_json() {
            Ok(candidate) => {
                for candidate in advertised(&candidate.candidate, &self.public) {
                    let _ = self
                        .events
                        .try_send(ServerMessage::IceCandidate { candidate });
                }
            }
            Err(error) => warn!("failed to serialize ICE candidate: {error}"),
        }
    }

    async fn on_connection_state_change(&self, connection_state: RTCPeerConnectionState) {
        info!("peer connection is {connection_state}");

        let _ = self
            .connected
            .send(connection_state == RTCPeerConnectionState::Connected);
    }

    async fn on_track(&self, track: Arc<dyn TrackRemote>) {
        let Some(ssrc) = track.ssrcs().await.first().copied() else {
            return;
        };
        let Some(codec) = track.codec(ssrc).await else {
            return;
        };

        if !codec.mime_type.eq_ignore_ascii_case(MIME_TYPE_OPUS) {
            debug!("ignoring a {} track", codec.mime_type);

            return;
        }

        let session = self.session.clone();

        tokio::spawn(async move {
            if let Err(error) = listen(track, session).await {
                warn!("the microphone track stopped: {error}");
            }
        });
    }
}

async fn listen(track: Arc<dyn TrackRemote>, session: Weak<Session>) -> anyhow::Result<()> {
    let mut uplink = Uplink::new()?;
    let mut heard = Vec::with_capacity(FRAME * 6);

    while let Some(event) = track.poll().await {
        match event {
            TrackRemoteEvent::OnRtpPacket(packet) => {
                let Some(session) = session.upgrade() else {
                    break;
                };

                heard.clear();
                uplink.accept(packet.header.sequence_number, &packet.payload, &mut heard)?;
                record(&session, &heard);
            }
            TrackRemoteEvent::OnEnded | TrackRemoteEvent::OnError => break,
            _ => {}
        }
    }

    Ok(())
}

fn record(session: &Session, heard: &[f32]) {
    if let Ok(mut microphone) = session.microphone.lock() {
        microphone.hear(heard);
    }
}

struct Uplink {
    decoder: Decoder,
    expected: Option<u16>,
}

impl Uplink {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            decoder: Decoder::new()?,
            expected: None,
        })
    }

    fn accept(
        &mut self,
        sequence: u16,
        payload: &[u8],
        heard: &mut Vec<f32>,
    ) -> anyhow::Result<()> {
        if payload.is_empty() {
            return Ok(());
        }

        let gap = self
            .expected
            .map_or(0, |expected| sequence.wrapping_sub(expected));

        if gap > u16::MAX / 2 {
            return Ok(());
        }

        let missing = gap.min(LONGEST_GAP);

        for lost in 0..missing {
            if lost + 1 == missing {
                self.decoder.recover(payload, heard)?;
            } else {
                self.decoder.conceal(heard)?;
            }
        }

        self.decoder.decode(payload, heard)?;
        self.expected = Some(sequence.wrapping_add(1));

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{audio::RATE, codec::frames};

    fn packets() -> Vec<Vec<u8>> {
        let tone: Vec<f32> = (0..RATE as usize)
            .map(|n| (std::f32::consts::TAU * 200.0 * n as f32 / RATE as f32).sin() * 0.3)
            .collect();
        let mut encoder = Encoder::new(24_000, 0.1).unwrap();

        frames(&tone)
            .map(|frame| encoder.encode(&frame).unwrap())
            .collect()
    }

    fn heard(arrivals: impl IntoIterator<Item = (u16, Vec<u8>)>) -> usize {
        let mut uplink = Uplink::new().unwrap();
        let mut samples = Vec::new();

        for (sequence, packet) in arrivals {
            uplink.accept(sequence, &packet, &mut samples).unwrap();
        }

        samples.len()
    }

    const HOST: &str = "candidate:3014926219 1 udp 2130706431 172.17.0.2 40000 typ host";

    #[test]
    fn a_host_candidate_is_advertised_at_each_public_address() {
        let public = vec!["203.0.113.7".to_string(), "198.51.100.9".to_string()];

        assert_eq!(
            advertised(HOST, &public),
            vec![
                "candidate:3014926219 1 udp 2130706431 203.0.113.7 40000 typ host",
                "candidate:3014926219 1 udp 2130706431 198.51.100.9 40000 typ host",
            ]
        );
    }

    #[test]
    fn candidates_are_left_alone_without_a_public_address() {
        assert_eq!(advertised(HOST, &[]), vec![HOST]);
    }

    #[test]
    fn only_host_candidates_are_rewritten() {
        let reflexive =
            "candidate:1 1 udp 1694498815 192.0.2.4 5000 typ srflx raddr 10.0.0.2 rport 5000";

        assert_eq!(
            advertised(reflexive, &["203.0.113.7".to_string()]),
            vec![reflexive]
        );
        assert_eq!(
            advertised("garbage", &["203.0.113.7".to_string()]),
            vec!["garbage"]
        );
    }

    #[test]
    fn packets_in_order_decode_to_their_length() {
        let sent = packets();
        let count = sent.len();
        let numbered = sent.into_iter().enumerate().map(|(n, p)| (n as u16, p));

        assert_eq!(heard(numbered), count * FRAME);
    }

    #[test]
    fn a_lost_packet_is_filled_in() {
        let sent = packets();
        let count = sent.len();
        let numbered = sent
            .into_iter()
            .enumerate()
            .filter(|(n, _)| *n != 7 && *n != 20 && *n != 21)
            .map(|(n, p)| (n as u16, p));

        assert_eq!(heard(numbered), count * FRAME);
    }

    #[test]
    fn late_and_empty_packets_are_ignored() {
        let sent = packets();
        let arrivals = vec![
            (10, sent[0].clone()),
            (11, sent[1].clone()),
            (9, sent[2].clone()),
            (12, Vec::new()),
            (12, sent[3].clone()),
        ];

        assert_eq!(heard(arrivals), 3 * FRAME);
    }

    #[test]
    fn sequence_numbers_wrap() {
        let sent = packets();
        let arrivals = vec![
            (u16::MAX - 1, sent[0].clone()),
            (u16::MAX, sent[1].clone()),
            (0, sent[2].clone()),
            (1, sent[3].clone()),
        ];

        assert_eq!(heard(arrivals), 4 * FRAME);
    }

    #[test]
    fn a_long_outage_is_capped() {
        let sent = packets();
        let arrivals = vec![(0, sent[0].clone()), (5_000, sent[1].clone())];

        assert_eq!(heard(arrivals), (2 + LONGEST_GAP as usize) * FRAME);
    }
}
