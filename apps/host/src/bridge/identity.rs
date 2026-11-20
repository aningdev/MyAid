//! Runner registration key (Ed25519) and Noise static key (X25519).
//!
//! Created the first time Bridge needs them, then kept. Regenerating would
//! orphan every paired Device.

use super::{disk, encode};
use crate::Result;
use curve25519_dalek::montgomery::MontgomeryPoint;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use std::{fmt, fs, path::Path};

pub(super) const REGISTRATION_PREFIX: &[u8] = b"dsh-bot-relay/1 runner\n";
const FILE: &str = "identity.json";

#[derive(Clone)]
pub(super) struct Identity {
    registration: [u8; 32],
    static_private: [u8; 32],
    static_public: [u8; 32],
    pub(super) runner_id: String,
}

impl fmt::Debug for Identity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Identity")
            .field("runner_id", &self.runner_id)
            .finish()
    }
}

impl Identity {
    pub(super) fn registration_public(&self) -> [u8; 32] {
        SigningKey::from_bytes(&self.registration)
            .verifying_key()
            .to_bytes()
    }

    pub(super) fn sign_registration(&self, nonce: &[u8]) -> [u8; 64] {
        let mut message = Vec::with_capacity(REGISTRATION_PREFIX.len() + nonce.len());
        message.extend_from_slice(REGISTRATION_PREFIX);
        message.extend_from_slice(nonce);
        SigningKey::from_bytes(&self.registration)
            .sign(&message)
            .to_bytes()
    }

    pub(super) fn static_private(&self) -> &[u8; 32] {
        &self.static_private
    }

    pub(super) fn static_public(&self) -> &[u8; 32] {
        &self.static_public
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileBody {
    registration_private: String,
    static_private: String,
    static_public: String,
}

pub(super) fn load_or_create(dir: &Path) -> Result<Identity> {
    let path = dir.join(FILE);
    if path.is_file() {
        return load(&path);
    }
    let registration = random_32()?;
    let static_private = random_32()?;
    let static_public = x25519_public(&static_private);
    let body = FileBody {
        registration_private: encode::b64(&registration),
        static_private: encode::b64(&static_private),
        static_public: encode::b64(&static_public),
    };
    let bytes = serde_json::to_vec_pretty(&body).map_err(|error| error.to_string())?;
    disk::write_private(&path, &bytes)?;
    Ok(identity_from(registration, static_private, static_public))
}

fn load(path: &Path) -> Result<Identity> {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let body: FileBody =
        serde_json::from_str(&text).map_err(|error| format!("identity.json: {error}"))?;
    let registration = encode::b64_32(&body.registration_private)?;
    let static_private = encode::b64_32(&body.static_private)?;
    let static_public = encode::b64_32(&body.static_public)?;
    if x25519_public(&static_private) != static_public {
        return Err("identity.json static public key does not match its private key".into());
    }
    Ok(identity_from(registration, static_private, static_public))
}

fn identity_from(
    registration: [u8; 32],
    static_private: [u8; 32],
    static_public: [u8; 32],
) -> Identity {
    let runner_id = encode::public_id(&registration_public(&registration));
    Identity {
        registration,
        static_private,
        static_public,
        runner_id,
    }
}

fn registration_public(seed: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(seed).verifying_key().to_bytes()
}

fn random_32() -> Result<[u8; 32]> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes)
}

/// Same clamped scalar multiplication snow uses for its X25519 static key.
pub(super) fn x25519_public(private: &[u8; 32]) -> [u8; 32] {
    *MontgomeryPoint::mul_base_clamped(*private).as_bytes()
}
