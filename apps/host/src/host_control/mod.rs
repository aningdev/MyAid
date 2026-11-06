//! Local host control Interface: local socket / named pipe + shared protocol.

mod protocol;
mod server;
pub mod transport;

pub use protocol::{
    MAX_FRAME, PROTOCOL, Request, Status, assert_connection_info, assert_public_status, call,
    decode_response, parse_ready_url, read_frame,
};
pub use server::serve;
pub use transport::default_endpoint;
