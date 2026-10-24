#[macro_use]
extern crate napi_derive;

mod memory;
mod ring_buffer;
mod stats;
mod watchdog;

use std::sync::Mutex;
use std::time::Instant;
use once_cell::sync::Lazy;

use memory::get_process_memory;
use ring_buffer::{MetricEvent, MetricRingBuffer};
use stats::compute_stats;
use watchdog::StallWatchdog;

static GLOBAL_BUFFER: Lazy<MetricRingBuffer> = Lazy::new(|| MetricRingBuffer::new(2048));
static GLOBAL_WATCHDOG: Lazy<Mutex<Option<StallWatchdog>>> = Lazy::new(|| Mutex::new(None));
static APP_START_INSTANT: Lazy<Instant> = Lazy::new(Instant::now);

#[napi(object)]
pub struct ProcessMemoryResult {
  pub resident_bytes: f64,
  pub resident_mb: f64,
  pub virtual_bytes: f64,
  pub virtual_mb: f64,
  pub physical_footprint_bytes: f64,
  pub physical_footprint_mb: f64,
  pub compressed_bytes: f64,
  pub compressed_mb: f64,
}

#[napi]
pub fn get_native_memory() -> ProcessMemoryResult {
  let mem = get_process_memory();
  ProcessMemoryResult {
    resident_bytes: mem.resident_bytes as f64,
    resident_mb: (mem.resident_bytes as f64) / (1024.0 * 1024.0),
    virtual_bytes: mem.virtual_bytes as f64,
    virtual_mb: (mem.virtual_bytes as f64) / (1024.0 * 1024.0),
    physical_footprint_bytes: mem.physical_footprint_bytes as f64,
    physical_footprint_mb: (mem.physical_footprint_bytes as f64) / (1024.0 * 1024.0),
    compressed_bytes: mem.compressed_bytes as f64,
    compressed_mb: (mem.compressed_bytes as f64) / (1024.0 * 1024.0),
  }
}

#[napi(object)]
pub struct WatchdogReport {
  pub is_running: bool,
  pub stall_threshold_ms: u32,
  pub total_stalls: u32,
  pub worst_stall_ms: f64,
  pub is_currently_stalled: bool,
}

#[napi]
pub fn start_watchdog(threshold_ms: u32, check_interval_ms: u32) -> bool {
  if let Ok(mut lock) = GLOBAL_WATCHDOG.lock() {
    if lock.is_none() {
      let wd = StallWatchdog::new(threshold_ms, check_interval_ms);
      *lock = Some(wd);
      return true;
    }
  }
  false
}

#[napi]
pub fn watchdog_tick() {
  if let Ok(lock) = GLOBAL_WATCHDOG.lock() {
    if let Some(wd) = lock.as_ref() {
      wd.tick();
    }
  }
}

#[napi]
pub fn get_watchdog_status() -> WatchdogReport {
  if let Ok(lock) = GLOBAL_WATCHDOG.lock() {
    if let Some(wd) = lock.as_ref() {
      let s = wd.status();
      return WatchdogReport {
        is_running: s.is_running,
        stall_threshold_ms: s.stall_threshold_ms,
        total_stalls: s.total_stalls,
        worst_stall_ms: s.worst_stall_ms,
        is_currently_stalled: s.is_currently_stalled,
      };
    }
  }
  WatchdogReport {
    is_running: false,
    stall_threshold_ms: 0,
    total_stalls: 0,
    worst_stall_ms: 0.0,
    is_currently_stalled: false,
  }
}

#[napi]
pub fn stop_watchdog() -> bool {
  if let Ok(mut lock) = GLOBAL_WATCHDOG.lock() {
    if let Some(mut wd) = lock.take() {
      wd.stop();
      return true;
    }
  }
  false
}

#[napi(object)]
#[derive(Clone)]
pub struct JsMetricEvent {
  pub timestamp_ms: f64,
  pub vital: String,
  pub value: f64,
  pub label: Option<String>,
  pub rating: String,
}

#[napi]
pub fn record_vital_metric(vital: String, value: f64, label: Option<String>, rating: String) {
  let event = MetricEvent {
    timestamp_ms: APP_START_INSTANT.elapsed().as_secs_f64() * 1000.0,
    vital,
    value,
    label,
    rating,
  };
  GLOBAL_BUFFER.push(event);
}

#[napi]
pub fn get_vital_events() -> Vec<JsMetricEvent> {
  GLOBAL_BUFFER
    .snapshot()
    .into_iter()
    .map(|e| JsMetricEvent {
      timestamp_ms: e.timestamp_ms,
      vital: e.vital,
      value: e.value,
      label: e.label,
      rating: e.rating,
    })
    .collect()
}

#[napi]
pub fn clear_vital_events() {
  GLOBAL_BUFFER.clear();
}

#[napi(object)]
pub struct MetricDistribution {
  pub count: u32,
  pub min: f64,
  pub max: f64,
  pub mean: f64,
  pub p50: f64,
  pub p90: f64,
  pub p95: f64,
  pub p99: f64,
}

#[napi]
pub fn compute_vital_distribution(vital: String) -> MetricDistribution {
  let events = GLOBAL_BUFFER.snapshot();
  let mut values: Vec<f64> = events
    .into_iter()
    .filter(|e| e.vital == vital)
    .map(|e| e.value)
    .collect();

  let s = compute_stats(&mut values);
  MetricDistribution {
    count: s.count,
    min: s.min,
    max: s.max,
    mean: s.mean,
    p50: s.p50,
    p90: s.p90,
    p95: s.p95,
    p99: s.p99,
  }
}
