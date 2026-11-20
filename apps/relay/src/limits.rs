//! Every protocol limit in one place. `serve` flags can lower them for tests.
//!
//! The values and the close codes they map to are contract:
//! [relay-tunnel](../../../docs/architecture/relay-tunnel.md#关闭码与限制).

use std::time::Duration;

/// Largest payload a Device may send in one message, and the largest payload
/// the Relay forwards towards a Device.
pub const MAX_MESSAGE: usize = 65_600;
/// Bytes one channel may have queued in one direction before `4003`.
pub const MAX_BACKLOG: usize = 1024 * 1024;
/// Live channels one Runner may have.
pub const MAX_CHANNELS: usize = 64;
/// Time a Device has to send its first message.
pub const IDLE: Duration = Duration::from_secs(10);
/// New Device connections one source IP may make per [`CONNECT_RATE_WINDOW`].
pub const CONNECT_RATE: u32 = 60;
/// The window [`CONNECT_RATE`] counts over.
pub const CONNECT_RATE_WINDOW: Duration = Duration::from_secs(60);
/// WebSocket ping period on both links.
pub const PING: Duration = Duration::from_secs(20);
/// Time a Runner has to answer the challenge with a valid `hello`.
pub const REGISTER: Duration = Duration::from_secs(10);

#[derive(Clone, Debug)]
pub struct Limits {
    pub max_message: usize,
    pub max_backlog: usize,
    pub max_channels: usize,
    pub idle: Duration,
    pub connect_rate: u32,
    pub connect_rate_window: Duration,
    pub ping: Duration,
    pub register: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_message: MAX_MESSAGE,
            max_backlog: MAX_BACKLOG,
            max_channels: MAX_CHANNELS,
            idle: IDLE,
            connect_rate: CONNECT_RATE,
            connect_rate_window: CONNECT_RATE_WINDOW,
            ping: PING,
            register: REGISTER,
        }
    }
}
