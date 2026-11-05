//! Local host control Interface: Unix socket + shared protocol.

mod protocol;
mod server;

pub use protocol::{MAX_FRAME, PROTOCOL, Request, Status, call, decode_response, read_frame};
pub use server::serve;
