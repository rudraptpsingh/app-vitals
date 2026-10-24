use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub struct WatchdogStatus {
  pub is_running: bool,
  pub stall_threshold_ms: u32,
  pub total_stalls: u32,
  pub worst_stall_ms: f64,
  pub is_currently_stalled: bool,
}

pub struct StallWatchdog {
  running: Arc<AtomicBool>,
  last_heartbeat: Arc<AtomicU64>,
  total_stalls: Arc<AtomicU64>,
  worst_stall_ms: Arc<AtomicU64>,
  is_stalled: Arc<AtomicBool>,
  threshold_ms: u32,
  handle: Option<JoinHandle<()>>,
  start_instant: Instant,
}

impl StallWatchdog {
  pub fn new(threshold_ms: u32, check_interval_ms: u32) -> Self {
    let running = Arc::new(AtomicBool::new(true));
    let last_heartbeat = Arc::new(AtomicU64::new(0));
    let total_stalls = Arc::new(AtomicU64::new(0));
    let worst_stall_ms = Arc::new(AtomicU64::new(0));
    let is_stalled = Arc::new(AtomicBool::new(false));

    let start_instant = Instant::now();
    let r_running = Arc::clone(&running);
    let r_last = Arc::clone(&last_heartbeat);
    let r_total = Arc::clone(&total_stalls);
    let r_worst = Arc::clone(&worst_stall_ms);
    let r_stalled = Arc::clone(&is_stalled);

    let handle = thread::spawn(move || {
      let interval = Duration::from_millis(check_interval_ms as u64);
      while r_running.load(Ordering::Relaxed) {
        thread::sleep(interval);
        let now_ms = start_instant.elapsed().as_millis() as u64;
        let last_ms = r_last.load(Ordering::Relaxed);
        if last_ms > 0 && now_ms > last_ms {
          let lag = now_ms - last_ms;
          if lag >= threshold_ms as u64 {
            r_stalled.store(true, Ordering::Relaxed);
            let prev_worst = r_worst.load(Ordering::Relaxed);
            if lag > prev_worst {
              r_worst.store(lag, Ordering::Relaxed);
            }
          } else {
            if r_stalled.swap(false, Ordering::Relaxed) {
              r_total.fetch_add(1, Ordering::Relaxed);
            }
          }
        }
      }
    });

    Self {
      running,
      last_heartbeat,
      total_stalls,
      worst_stall_ms,
      is_stalled,
      threshold_ms,
      handle: Some(handle),
      start_instant,
    }
  }

  pub fn tick(&self) {
    let now_ms = self.start_instant.elapsed().as_millis() as u64;
    self.last_heartbeat.store(now_ms, Ordering::Relaxed);
  }

  pub fn status(&self) -> WatchdogStatus {
    WatchdogStatus {
      is_running: self.running.load(Ordering::Relaxed),
      stall_threshold_ms: self.threshold_ms,
      total_stalls: self.total_stalls.load(Ordering::Relaxed) as u32,
      worst_stall_ms: self.worst_stall_ms.load(Ordering::Relaxed) as f64,
      is_currently_stalled: self.is_stalled.load(Ordering::Relaxed),
    }
  }

  pub fn stop(&mut self) {
    self.running.store(false, Ordering::Relaxed);
    if let Some(h) = self.handle.take() {
      let _ = h.join();
    }
  }
}

impl Drop for StallWatchdog {
  fn drop(&mut self) {
    self.stop();
  }
}
