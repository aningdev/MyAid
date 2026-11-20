//! Runner registration: the challenge nonce, `hello` verification and runner ids.

use crate::Result;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

/// The bytes a Runner signs in front of the challenge nonce.
pub const REGISTRATION_PREFIX: &[u8] = b"dsh-bot-relay/1 runner\n";

const NONCE: usize = 32;
const KEY: usize = 32;
const SIGNATURE: usize = 64;

pub fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn b64_decode(text: &str) -> Result<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(text)
        .map_err(|_| "invalid base64url".into())
}

/// SHA-256 of the raw public key, first 20 bytes, lowercase unpadded base32
/// (32 characters). Runner and Device ids both use it.
pub fn public_id(public_key: &[u8]) -> String {
    let hash = Sha256::digest(public_key);
    data_encoding::BASE32_NOPAD
        .encode(&hash[..20])
        .to_ascii_lowercase()
}

pub fn random_nonce() -> Result<[u8; NONCE]> {
    let mut nonce = [0u8; NONCE];
    getrandom::fill(&mut nonce).map_err(|error| error.to_string())?;
    Ok(nonce)
}

/// The Runner's answer to the challenge, as it arrives on the wire.
#[derive(Deserialize)]
pub struct Hello {
    #[serde(rename = "type")]
    kind: String,
    protocol: u32,
    key: String,
    sig: String,
}

/// Check `hello` against the nonce and return `(runner id, public key)`.
pub fn verify(hello: &Hello, nonce: &[u8]) -> Result<(String, [u8; KEY])> {
    if hello.kind != "hello" {
        return Err("runner registration did not answer the challenge".into());
    }
    if hello.protocol != 1 {
        return Err("unsupported relay protocol".into());
    }
    let key: [u8; KEY] = b64_decode(&hello.key)?
        .as_slice()
        .try_into()
        .map_err(|_| "runner key is not 32 bytes")?;
    let signature: [u8; SIGNATURE] = b64_decode(&hello.sig)?
        .as_slice()
        .try_into()
        .map_err(|_| "runner signature is not 64 bytes")?;
    let verifying = VerifyingKey::from_bytes(&key).map_err(|_| "invalid runner key")?;
    let mut message = Vec::with_capacity(REGISTRATION_PREFIX.len() + nonce.len());
    message.extend_from_slice(REGISTRATION_PREFIX);
    message.extend_from_slice(nonce);
    verifying
        .verify_strict(&message, &Signature::from_bytes(&signature))
        .map_err(|_| "runner signature does not match the challenge")?;
    Ok((public_id(&key), key))
}
