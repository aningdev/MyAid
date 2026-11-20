//! Noise responder. Daily connections are IK; pairing is IKpsk1.
//!
//! IKpsk1 mixes the psk into message 1, so a successful decrypt proves the initiator
//! holds the current psk.

use super::frames::{MODE_DAILY, MODE_PAIR};
use crate::Result;

pub(super) const IK: &str = "Noise_IK_25519_ChaChaPoly_SHA256";
pub(super) const IK_PSK1: &str = "Noise_IKpsk1_25519_ChaChaPoly_SHA256";

pub(super) fn pattern(name: &str) -> Result<snow::params::NoiseParams> {
    name.parse().map_err(|error: snow::Error| error.to_string())
}

/// `dsh-bot-tunnel/1`, then the mode byte, then the runner id.
pub(super) fn prologue(mode: u8, runner_id: &str) -> Vec<u8> {
    let mut bytes = b"dsh-bot-tunnel/1".to_vec();
    bytes.push(mode);
    bytes.extend_from_slice(runner_id.as_bytes());
    bytes
}

pub(super) struct Handshake {
    state: snow::HandshakeState,
    pub(super) remote: [u8; 32],
    pub(super) payload: Vec<u8>,
}

pub(super) fn read_initiator(
    static_private: &[u8; 32],
    mode: u8,
    runner_id: &str,
    psk: Option<&[u8; 32]>,
    message: &[u8],
) -> Result<Handshake> {
    let prologue = prologue(mode, runner_id);
    let name = if psk.is_some() { IK_PSK1 } else { IK };
    if psk.is_some() {
        debug_assert_eq!(mode, MODE_PAIR);
    } else {
        debug_assert_eq!(mode, MODE_DAILY);
    }
    let params = pattern(name)?;
    let mut builder = snow::Builder::new(params)
        .local_private_key(static_private)
        .map_err(|error| error.to_string())?
        .prologue(&prologue)
        .map_err(|error| error.to_string())?;
    if let Some(psk) = psk {
        builder = builder.psk(1, psk).map_err(|error| error.to_string())?;
    }
    let mut state = builder
        .build_responder()
        .map_err(|error| error.to_string())?;
    let payload = read(&mut state, message)?;
    let remote_bytes = state
        .get_remote_static()
        .ok_or("handshake has no device static key")?;
    let remote = remote_bytes
        .try_into()
        .map_err(|_| "device static key must be 32 bytes".to_string())?;
    Ok(Handshake {
        state,
        remote,
        payload,
    })
}

pub(super) fn write_second(handshake: &mut Handshake, payload: &[u8]) -> Result<Vec<u8>> {
    write(&mut handshake.state, payload)
}

pub(super) fn into_transport(handshake: Handshake) -> Result<snow::TransportState> {
    handshake
        .state
        .into_transport_mode()
        .map_err(|error| error.to_string())
}

pub(super) fn read_transport(state: &mut snow::TransportState, message: &[u8]) -> Result<Vec<u8>> {
    let mut buf = vec![0u8; 65_535];
    let len = state
        .read_message(message, &mut buf)
        .map_err(|error| error.to_string())?;
    buf.truncate(len);
    Ok(buf)
}

pub(super) fn write_transport(state: &mut snow::TransportState, payload: &[u8]) -> Result<Vec<u8>> {
    write(state, payload)
}

fn read(state: &mut snow::HandshakeState, message: &[u8]) -> Result<Vec<u8>> {
    let mut buf = vec![0u8; 65_535];
    let len = state
        .read_message(message, &mut buf)
        .map_err(|error| error.to_string())?;
    buf.truncate(len);
    Ok(buf)
}

fn write(state: &mut impl SnowWrite, payload: &[u8]) -> Result<Vec<u8>> {
    let mut buf = vec![0u8; payload.len() + 256];
    let len = state
        .write_message(payload, &mut buf)
        .map_err(|error| error.to_string())?;
    buf.truncate(len);
    Ok(buf)
}

trait SnowWrite {
    fn write_message(
        &mut self,
        payload: &[u8],
        message: &mut [u8],
    ) -> std::result::Result<usize, snow::Error>;
}

impl SnowWrite for snow::HandshakeState {
    fn write_message(
        &mut self,
        payload: &[u8],
        message: &mut [u8],
    ) -> std::result::Result<usize, snow::Error> {
        snow::HandshakeState::write_message(self, payload, message)
    }
}

impl SnowWrite for snow::TransportState {
    fn write_message(
        &mut self,
        payload: &[u8],
        message: &mut [u8],
    ) -> std::result::Result<usize, snow::Error> {
        snow::TransportState::write_message(self, payload, message)
    }
}
