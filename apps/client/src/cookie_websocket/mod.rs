//! Cookie-bearing WebSocket handshake missing from NSH standard APIs (still in 0.4).
//! HTTP and ordinary WebSockets use NSH; authentication policy stays in TypeScript.
//! See docs/DSH_CLIENT_AUTH.md and the NSH 0.4 auth verdict in the Project store.
mod socket;

use nsh_core::prelude::*;
pub use socket::Socket;

/// Local dsh WebSocket I/O with an explicitly supplied authentication Cookie.
#[module]
pub struct CookieWebSocket;

#[module]
impl CookieWebSocket {
    /// Open only the loopback dsh API socket; no bootstrap or credential storage.
    pub async fn connect(url: String, cookie: String) -> Result<Socket, String> {
        socket::connect(url, cookie).await
    }
}
