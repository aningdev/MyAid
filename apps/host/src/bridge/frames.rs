//! Relay channel frames and the tunnel's stream frames.
//!
//! Relay: `[u32 channel][u8 type][payload]`, big-endian. Stream plaintext:
//! `[u32 stream][u8 type][body]`.

use crate::Result;

pub(super) const OPEN: u8 = 1;
pub(super) const DATA: u8 = 2;
pub(super) const CLOSE: u8 = 3;

/// Device → Bridge: `{"method","path","headers":[[name,value]…]}`. Opens an HTTP stream.
pub(super) const HTTP_REQUEST: u8 = 1;
/// Bridge → Device: `{"status","headers":[[name,value]…]}`.
pub(super) const HTTP_RESPONSE: u8 = 2;
pub(super) const BODY: u8 = 3;
pub(super) const END: u8 = 4;
/// Device → Bridge: `{"path","protocols":[name…]}`. Opens a websocket stream.
pub(super) const WS_OPEN: u8 = 5;
/// Bridge → Device: `{"protocol"}` — the negotiated subprotocol, or null.
pub(super) const WS_ACCEPT: u8 = 6;
pub(super) const WS_TEXT: u8 = 7;
pub(super) const WS_BINARY: u8 = 8;
/// `{"code","reason"}`.
pub(super) const WS_CLOSE: u8 = 9;
/// `{"code"}`; aborts this stream.
pub(super) const RESET: u8 = 10;
pub(super) const CONTROL: u8 = 11;

/// Largest stream body Bridge emits in one frame. Ciphertext stays well under the Relay's
/// 65 600-byte message limit and Noise's 65 535-byte message limit.
pub(super) const MAX_FRAME_BODY: usize = 60 * 1024;

/// Normal end, including after `device-revoked` or `revoked`.
pub(super) const CLOSE_NORMAL: u16 = 1000;
/// Pairing rejected: no usable psk, or message 1 did not decrypt. Nothing is enrolled.
pub(super) const CLOSE_PAIRING_REJECTED: u16 = 4010;
/// Unknown mode byte, or a daily message 1 that did not decrypt.
pub(super) const CLOSE_HANDSHAKE_FAILED: u16 = 4011;

pub(super) const MODE_DAILY: u8 = 1;
pub(super) const MODE_PAIR: u8 = 2;

pub(super) enum RelayFrame {
    Open { channel: u32 },
    Data { channel: u32, payload: Vec<u8> },
    Close { channel: u32, code: u16 },
}

#[cfg(test)]
pub(super) fn open(channel: u32) -> Vec<u8> {
    let mut bytes = channel.to_be_bytes().to_vec();
    bytes.push(OPEN);
    bytes
}

pub(super) fn data(channel: u32, payload: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(5 + payload.len());
    bytes.extend_from_slice(&channel.to_be_bytes());
    bytes.push(DATA);
    bytes.extend_from_slice(payload);
    bytes
}

pub(super) fn close(channel: u32, code: u16) -> Vec<u8> {
    let mut bytes = channel.to_be_bytes().to_vec();
    bytes.push(CLOSE);
    bytes.extend_from_slice(&code.to_be_bytes());
    bytes
}

pub(super) fn decode(bytes: &[u8]) -> Option<RelayFrame> {
    if bytes.len() < 5 {
        return None;
    }
    let channel = u32::from_be_bytes(bytes[0..4].try_into().ok()?);
    match bytes[4] {
        OPEN if bytes.len() == 5 => Some(RelayFrame::Open { channel }),
        DATA => Some(RelayFrame::Data {
            channel,
            payload: bytes[5..].to_vec(),
        }),
        CLOSE if bytes.len() == 7 => Some(RelayFrame::Close {
            channel,
            code: u16::from_be_bytes(bytes[5..7].try_into().ok()?),
        }),
        _ => None,
    }
}

/// `{"code":code}` — the body every `RESET` carries.
pub(super) fn code(code: &str) -> Vec<u8> {
    serde_json::json!({ "code": code }).to_string().into_bytes()
}

pub(super) fn stream(stream_id: u32, kind: u8, body: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(5 + body.len());
    bytes.extend_from_slice(&stream_id.to_be_bytes());
    bytes.push(kind);
    bytes.extend_from_slice(body);
    bytes
}

pub(super) fn parse_stream(plain: &[u8]) -> Result<(u32, u8, &[u8])> {
    if plain.len() < 5 {
        return Err("short stream frame".into());
    }
    let stream_id = u32::from_be_bytes(plain[0..4].try_into().map_err(|_| "stream id")?);
    Ok((stream_id, plain[4], &plain[5..]))
}
