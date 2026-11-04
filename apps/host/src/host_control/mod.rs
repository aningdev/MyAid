//! Local host control Interface (empty shell + principle-level protocol).

mod protocol;

pub use protocol::{MAX_FRAME, PROTOCOL, Request, Status};

use crate::{Config, Result};

pub fn serve(config: Config) -> Result<()> {
    let _idle = Status::stopped("0.0.0-placeholder");
    Err(format!(
        "myaid-host empty shell: serve not implemented (data_root={}, protocol={PROTOCOL})",
        config.data_root
    ))
}
