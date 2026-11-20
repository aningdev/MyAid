//! Per-source-IP connection rate for `/v1/device`.

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::Mutex,
    time::{Duration, Instant},
};

/// Above this many remembered addresses, the limiter forgets expired windows.
const PRUNE_AT: usize = 4096;

pub struct RateLimiter {
    max: u32,
    window: Duration,
    seen: Mutex<HashMap<IpAddr, Window>>,
}

struct Window {
    start: Instant,
    count: u32,
}

impl RateLimiter {
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            max,
            window,
            seen: Mutex::new(HashMap::new()),
        }
    }

    /// Count one connection from `ip`; `false` means it exceeded the limit.
    pub fn allow(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut seen = self.seen.lock().unwrap_or_else(|error| error.into_inner());
        if seen.len() >= PRUNE_AT {
            seen.retain(|_, window| now.duration_since(window.start) < self.window);
        }
        let window = seen.entry(ip).or_insert(Window {
            start: now,
            count: 0,
        });
        if now.duration_since(window.start) >= self.window {
            *window = Window {
                start: now,
                count: 0,
            };
        }
        if window.count >= self.max {
            return false;
        }
        window.count += 1;
        true
    }
}
