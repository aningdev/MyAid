//! `/v1/device`: one Device WebSocket mapped to one Relay channel.

use crate::{
    frame::{self, device_close_code_ok},
    limits::Limits,
    rate::RateLimiter,
    runner::{Command, Event, Registry},
    tap::Tap,
};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::{
    net::IpAddr,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    sync::{
        mpsc::{self, UnboundedReceiver, UnboundedSender},
        oneshot,
    },
    time::{Instant, interval_at, sleep_until, timeout},
};

/// Time the Runner link gets to allocate a channel.
const OPEN: Duration = Duration::from_secs(10);

pub async fn serve_connection(
    socket: WebSocket,
    runner: Option<String>,
    peer: IpAddr,
    rate: Arc<RateLimiter>,
    registry: Arc<Registry>,
    limits: Limits,
    tap: Tap,
) {
    if !rate.allow(peer) {
        tracing::warn!(%peer, "relay device rate limited");
        frame::close_socket(socket, frame::TOO_MANY).await;
        return;
    }
    let Some(id) = runner.filter(|id| !id.is_empty()) else {
        tracing::debug!(%peer, "relay device without a runner id");
        frame::close_socket(socket, frame::RUNNER_OFFLINE).await;
        return;
    };
    let Some(commands) = registry.commands(&id) else {
        tracing::debug!(runner = %id, "relay device for an offline runner");
        frame::close_socket(socket, frame::RUNNER_OFFLINE).await;
        return;
    };

    let backlog = Arc::new(AtomicUsize::new(0));
    let (inbound, inbound_rx) = mpsc::unbounded_channel();
    let (reply_tx, reply_rx) = oneshot::channel();
    if commands
        .send(Command::Open {
            inbound,
            backlog: backlog.clone(),
            reply: reply_tx,
        })
        .is_err()
    {
        frame::close_socket(socket, frame::RUNNER_OFFLINE).await;
        return;
    }
    let channel = match timeout(OPEN, reply_rx).await {
        Ok(Ok(Ok(channel))) => channel,
        Ok(Ok(Err(code))) => {
            frame::close_socket(socket, code).await;
            return;
        }
        _ => {
            frame::close_socket(socket, frame::RUNNER_OFFLINE).await;
            return;
        }
    };
    tracing::debug!(runner = %id, channel, "relay device channel open");
    forward(socket, channel, commands, inbound_rx, backlog, limits, tap).await;
}

async fn forward(
    socket: WebSocket,
    channel: u32,
    commands: UnboundedSender<Command>,
    mut inbound: UnboundedReceiver<Event>,
    backlog: Arc<AtomicUsize>,
    limits: Limits,
    tap: Tap,
) {
    let (mut sink, mut stream) = socket.split();
    let first_deadline = Instant::now() + limits.idle;
    let mut waiting = true;
    let mut heartbeat = interval_at(Instant::now() + limits.ping, limits.ping);
    let mut close: Option<u16> = None;
    let mut from_runner = false;

    loop {
        tokio::select! {
            message = stream.next() => match message {
                Some(Ok(Message::Binary(bytes))) => {
                    waiting = false;
                    tap.record("device", "in", &bytes);
                    let length = bytes.len();
                    if length + frame::HEADER > limits.max_message
                        || backlog.load(Ordering::Acquire) + length > limits.max_backlog
                    {
                        tracing::warn!(channel, length, "relay device overloaded");
                        close = Some(frame::OVERLOADED);
                        break;
                    }
                    backlog.fetch_add(length, Ordering::AcqRel);
                    if commands
                        .send(Command::Data {
                            channel,
                            payload: bytes.to_vec(),
                            queued: backlog.clone(),
                        })
                        .is_err()
                    {
                        close = Some(frame::RUNNER_OFFLINE);
                        break;
                    }
                }
                Some(Ok(Message::Close(code))) => {
                    close = code.map(|frame| frame.code);
                    break;
                }
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                Some(Ok(_)) => {
                    tracing::warn!(channel, "relay device sent a non-binary frame");
                    close = Some(frame::UNSUPPORTED);
                    break;
                }
                Some(Err(error)) => {
                    tracing::debug!(%error, channel, "relay device socket");
                    break;
                }
                None => break,
            },
            event = inbound.recv() => match event {
                Some(Event::Data(payload)) => {
                    tap.record("device", "out", &payload);
                    let length = payload.len();
                    if sink.send(Message::Binary(payload.into())).await.is_err() {
                        break;
                    }
                    backlog.fetch_sub(length, Ordering::AcqRel);
                }
                Some(Event::Close(code)) => {
                    from_runner = true;
                    close = Some(code);
                    break;
                }
                None => {
                    close = Some(frame::RUNNER_OFFLINE);
                    break;
                }
            },
            _ = sleep_until(first_deadline), if waiting => {
                tracing::debug!(channel, "relay device idle");
                close = Some(frame::IDLE);
                break;
            }
            _ = heartbeat.tick() => {
                if sink.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }

    let requested = close.unwrap_or(frame::NORMAL);
    let code = if from_runner && !device_close_code_ok(requested) {
        tracing::warn!(channel, requested, "relay refused an invalid close code");
        frame::INTERNAL
    } else {
        requested
    };
    let _ = sink
        .send(Message::Close(Some(frame::close_frame(code))))
        .await;
    if !from_runner {
        let _ = commands.send(Command::Closed { channel, code });
    }
}
