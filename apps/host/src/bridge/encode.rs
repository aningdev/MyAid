//! Base64url (no padding) for protocol fields, and the runner/device id encoding.

use crate::Result;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};

pub(super) fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub(super) fn b64_decode(text: &str) -> Result<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(text)
        .map_err(|_| "invalid base64url".into())
}

pub(super) fn b64_32(text: &str) -> Result<[u8; 32]> {
    let bytes = b64_decode(text)?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| "expected 32 bytes".into())
}

/// SHA-256 of the raw public key, first 20 bytes, lowercase unpadded base32 (32 characters).
pub(super) fn public_id(public_key: &[u8]) -> String {
    let hash = Sha256::digest(public_key);
    data_encoding::BASE32_NOPAD
        .encode(&hash[..20])
        .to_ascii_lowercase()
}
