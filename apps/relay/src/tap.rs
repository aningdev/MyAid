//! Records every binary frame the Relay relays.
//!
//! Only builds with the `frame-tap` feature, and only records when `serve` is
//! given `--frame-tap PATH`: the end-to-end test that proves the Relay never
//! sees plaintext (spec acceptance 8) reads the file back. Production builds
//! have no flag and write nothing.
//!
//! Each line is `{"seq":n,"link":"bridge"|"device","dir":"in"|"out","bytes":"<base64url>"}`,
//! where `dir` is relative to `link`. Text frames of the registration are not
//! recorded; every `OPEN`, `DATA` and `CLOSE` is.

use std::{
    io::Write,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

#[derive(Clone, Default)]
pub struct Tap {
    inner: Option<Arc<Inner>>,
}

struct Inner {
    sequence: AtomicU64,
    file: Mutex<std::fs::File>,
}

impl Tap {
    /// `None` produces a tap that records nothing.
    #[cfg(feature = "frame-tap")]
    pub fn from_path(path: Option<&Path>) -> std::io::Result<Self> {
        let Some(path) = path else {
            return Ok(Self::default());
        };
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        Ok(Self {
            inner: Some(Arc::new(Inner {
                sequence: AtomicU64::new(0),
                file: Mutex::new(file),
            })),
        })
    }

    /// `--frame-tap` does not exist in this build, so nothing is recorded.
    #[cfg(not(feature = "frame-tap"))]
    pub fn from_path(_: Option<&Path>) -> std::io::Result<Self> {
        Ok(Self::default())
    }

    pub fn record(&self, link: &str, direction: &str, bytes: &[u8]) {
        let Some(inner) = &self.inner else {
            return;
        };
        let line = serde_json::json!({
            "seq": inner.sequence.fetch_add(1, Ordering::AcqRel),
            "link": link,
            "dir": direction,
            "bytes": crate::auth::b64(bytes),
        });
        let mut file = inner.file.lock().unwrap_or_else(|error| error.into_inner());
        let _ = writeln!(file, "{line}");
        let _ = file.flush();
    }
}
