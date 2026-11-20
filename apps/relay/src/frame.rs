//! Relay channel frames, close codes and the WebSocket close helper.
//!
//! Bridge ↔ Relay messages are `[u32 channel][u8 type][payload]`, big-endian;
//! Device ↔ Relay messages are the payload alone. The contract is
//! [relay-tunnel](../../../docs/architecture/relay-tunnel.md#帧).

use axum::extract::ws::{CloseFrame, Message, WebSocket};

/// Relay → Bridge: this channel exists; the payload is empty.
pub const OPEN: u8 = 1;
/// Either direction: the payload is tunnel ciphertext.
pub const DATA: u8 = 2;
/// Either direction: the payload is the `u16` close code, big-endian.
pub const CLOSE: u8 = 3;

/// Bytes of `[u32 channel][u8 type]` in front of every payload.
pub const HEADER: usize = 5;

/// Device connected while its Runner is not registered, or the registration ended.
pub const RUNNER_OFFLINE: u16 = 4001;
/// A newer registration of the same runner id replaced the old connection.
pub const REPLACED: u16 = 4002;
/// One direction queued more than the backlog limit, or one message was too large.
pub const OVERLOADED: u16 = 4003;
/// Runner registration failed: bad `hello`, bad protocol or a bad signature.
pub const BAD_AUTH: u16 = 4004;
/// The runner already has the maximum number of channels, or a source IP exceeded
/// the connection rate limit.
pub const TOO_MANY: u16 = 4005;
/// The Device sent no first message in time.
pub const IDLE: u16 = 4006;

/// Normal end.
pub const NORMAL: u16 = 1000;
/// A close code arrived that the WebSocket protocol does not allow us to send.
pub const INTERNAL: u16 = 1011;
/// The Device sent something other than a binary frame.
pub const UNSUPPORTED: u16 = 1003;

/// A frame from Bridge to Relay.
pub enum BridgeFrame {
    Open,
    Data { channel: u32, payload: Vec<u8> },
    Close { channel: u32, code: u16 },
}

impl BridgeFrame {
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < HEADER {
            return None;
        }
        let channel = u32::from_be_bytes(bytes[0..4].try_into().ok()?);
        match bytes[4] {
            OPEN if bytes.len() == HEADER => Some(Self::Open),
            DATA => Some(Self::Data {
                channel,
                payload: bytes[HEADER..].to_vec(),
            }),
            CLOSE if bytes.len() == HEADER + 2 => Some(Self::Close {
                channel,
                code: u16::from_be_bytes(bytes[HEADER..HEADER + 2].try_into().ok()?),
            }),
            _ => None,
        }
    }
}

pub fn open(channel: u32) -> Vec<u8> {
    let mut bytes = channel.to_be_bytes().to_vec();
    bytes.push(OPEN);
    bytes
}

pub fn data(channel: u32, payload: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER + payload.len());
    bytes.extend_from_slice(&channel.to_be_bytes());
    bytes.push(DATA);
    bytes.extend_from_slice(payload);
    bytes
}

pub fn close(channel: u32, code: u16) -> Vec<u8> {
    let mut bytes = channel.to_be_bytes().to_vec();
    bytes.push(CLOSE);
    bytes.extend_from_slice(&code.to_be_bytes());
    bytes
}

/// The codes a WebSocket peer may send us: `1000` or an application code.
pub fn device_close_code_ok(code: u16) -> bool {
    code == NORMAL || (3000..=4999).contains(&code)
}

pub fn close_frame(code: u16) -> CloseFrame {
    CloseFrame {
        code,
        reason: "".into(),
    }
}

/// Close a WebSocket that never reached a forwarding loop.
pub async fn close_socket(mut socket: WebSocket, code: u16) {
    let _ = socket.send(Message::Close(Some(close_frame(code)))).await;
}
