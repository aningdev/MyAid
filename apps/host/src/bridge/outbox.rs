//! A channel's outbound frames and its per-stream backlog.
//!
//! One owner counts bytes: a stream's payload is added when the channel encrypts it and
//! released only once the Relay socket accepted the frame. A stream over the limit is reset
//! with `overloaded`, never silently dropped.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

/// Bytes one stream may have queued toward the Relay before Bridge resets it.
pub(super) const MAX_BACKLOG: usize = 1024 * 1024;

/// An encrypted Relay frame, plus what to release once it is written.
pub(super) struct OutFrame {
    pub bytes: Vec<u8>,
    pub stream: u32,
    pub size: usize,
    pub outbox: Arc<Outbox>,
}

#[derive(Default)]
pub(super) struct Outbox {
    pending: Mutex<HashMap<u32, usize>>,
}

impl Outbox {
    pub(super) fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Counts `size` more bytes for `stream`; false when that would pass the limit.
    pub(super) fn reserve(&self, stream: u32, size: usize) -> bool {
        let mut pending = lock(&self.pending);
        let total = pending.entry(stream).or_default();
        if total.saturating_add(size) > MAX_BACKLOG {
            return false;
        }
        *total += size;
        true
    }

    /// The Relay socket took the frame; the stream may queue that much again.
    pub(super) fn release(&self, stream: u32, size: usize) {
        if size == 0 {
            return;
        }
        let mut pending = lock(&self.pending);
        let Some(total) = pending.get_mut(&stream) else {
            return;
        };
        *total = total.saturating_sub(size);
        if *total == 0 {
            pending.remove(&stream);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
