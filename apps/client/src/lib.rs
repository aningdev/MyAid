//! Native registration for the MyAid NSH mixed crate (`myaid/native`).
//!
//! - Shell demo: Badge / Format / Counter (from `nsh init --template mixed`)
//! - DSH auth gap: CookieWebSocket (NSH 0.4 still refuses Cookie on standard WS)

mod cookie_websocket;
mod shell_demo;

pub use cookie_websocket::{CookieWebSocket, Socket};
pub use shell_demo::{Badge, Counter, Format};

use nsh_core::prelude::*;

/// The crate's UI set (`nsh.json` `"rust"`).
#[native_module("myaid/native")]
fn native(registry: &mut Registry) {
    registry
        .register::<Badge>()
        .module::<Format>()
        .class::<Counter>()
        .module::<CookieWebSocket>()
        .class::<Socket>();
}
