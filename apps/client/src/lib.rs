//! Native registration for the MyAid NSH mixed crate (`myaid/native`).
//!
//! - Shell demo: Badge / Format / Counter (from `nsh init --template mixed`)
//! - Host control: Unix socket lifecycle adapter
//! - Relay control: relay lifecycle adapter

mod host_control;
mod relay_control;
mod shell_demo;

pub use host_control::{HostControl, HostWatch};
pub use relay_control::RelayControl;
pub use shell_demo::{Badge, Counter, Format};

use nsh_core::prelude::*;

/// The crate's UI set (`nsh.json` `"rust"`).
#[native_module("myaid/native")]
fn native(registry: &mut Registry) {
    registry
        .register::<Badge>()
        .module::<Format>()
        .class::<Counter>()
        .module::<HostControl>()
        .class::<HostWatch>()
        .module::<RelayControl>();
}
