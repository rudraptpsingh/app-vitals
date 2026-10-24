#[derive(Debug, Clone, Default)]
pub struct VitalStats {
  pub count: u32,
  pub min: f64,
  pub max: f64,
  pub mean: f64,
  pub p50: f64,
  pub p90: f64,
  pub p95: f64,
  pub p99: f64,
}

pub fn compute_stats(values: &mut [f64]) -> VitalStats {
  if values.is_empty() {
    return VitalStats::default();
  }

  values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
  let count = values.len() as u32;
  let min = values[0];
  let max = values[values.len() - 1];
  let sum: f64 = values.iter().sum();
  let mean = sum / (count as f64);

  let p50 = values[(values.len() as f64 * 0.50) as usize];
  let p90 = values[((values.len() as f64 * 0.90) as usize).min(values.len() - 1)];
  let p95 = values[((values.len() as f64 * 0.95) as usize).min(values.len() - 1)];
  let p99 = values[((values.len() as f64 * 0.99) as usize).min(values.len() - 1)];

  VitalStats {
    count,
    min: (min * 100.0).round() / 100.0,
    max: (max * 100.0).round() / 100.0,
    mean: (mean * 100.0).round() / 100.0,
    p50: (p50 * 100.0).round() / 100.0,
    p90: (p90 * 100.0).round() / 100.0,
    p95: (p95 * 100.0).round() / 100.0,
    p99: (p99 * 100.0).round() / 100.0,
  }
}
