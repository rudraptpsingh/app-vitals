use std::sync::Mutex;

#[derive(Debug, Clone)]
pub struct MetricEvent {
  pub timestamp_ms: f64,
  pub vital: String,
  pub value: f64,
  pub label: Option<String>,
  pub rating: String,
}

pub struct MetricRingBuffer {
  capacity: usize,
  events: Mutex<Vec<MetricEvent>>,
}

impl MetricRingBuffer {
  pub fn new(capacity: usize) -> Self {
    Self {
      capacity,
      events: Mutex::new(Vec::with_capacity(capacity)),
    }
  }

  pub fn push(&self, event: MetricEvent) {
    if let Ok(mut lock) = self.events.lock() {
      if lock.len() >= self.capacity {
        lock.remove(0);
      }
      lock.push(event);
    }
  }

  pub fn snapshot(&self) -> Vec<MetricEvent> {
    if let Ok(lock) = self.events.lock() {
      lock.clone()
    } else {
      Vec::new()
    }
  }

  pub fn clear(&self) {
    if let Ok(mut lock) = self.events.lock() {
      lock.clear();
    }
  }

  pub fn len(&self) -> usize {
    if let Ok(lock) = self.events.lock() {
      lock.len()
    } else {
      0
    }
  }
}
