#[cfg(target_os = "macos")]
use std::mem;

#[derive(Debug, Clone, Default)]
pub struct ProcessMemoryInfo {
  pub resident_bytes: u64,
  pub virtual_bytes: u64,
  pub physical_footprint_bytes: u64,
  pub compressed_bytes: u64,
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
pub fn get_process_memory() -> ProcessMemoryInfo {
  use libc::{mach_msg_type_number_t, mach_task_self, task_info, kern_return_t, KERN_SUCCESS};

  // task_vm_info_data_t holds detailed footprint and compressed memory stats on macOS
  #[repr(C)]
  #[derive(Default)]
  struct TaskVmInfo {
    virtual_size: u64,
    region_count: i32,
    page_size: i32,
    resident_size: u64,
    resident_size_peak: u64,
    device: u64,
    device_peak: u64,
    internal: u64,
    internal_peak: u64,
    external: u64,
    external_peak: u64,
    reusable: u64,
    reusable_peak: u64,
    purgeable_volatile_pmap: u64,
    purgeable_volatile_resident: u64,
    purgeable_volatile_virtual: u64,
    compressed: u64,
    compressed_peak: u64,
    compressed_lifetime: u64,
    phys_footprint: u64,
    min_address: u64,
    max_address: u64,
    ledger_tag: i64,
    ledger_version: u64,
    ledger_flags: u64,
  }

  const TASK_VM_INFO: u32 = 22;
  const TASK_VM_INFO_COUNT: mach_msg_type_number_t =
    (mem::size_of::<TaskVmInfo>() / mem::size_of::<i32>()) as mach_msg_type_number_t;

  unsafe {
    let mut info = TaskVmInfo::default();
    let mut count = TASK_VM_INFO_COUNT;

    let ret: kern_return_t = task_info(
      mach_task_self(),
      TASK_VM_INFO,
      &mut info as *mut _ as *mut i32,
      &mut count,
    );

    if ret == KERN_SUCCESS {
      ProcessMemoryInfo {
        resident_bytes: info.resident_size,
        virtual_bytes: info.virtual_size,
        physical_footprint_bytes: info.phys_footprint,
        compressed_bytes: info.compressed,
      }
    } else {
      ProcessMemoryInfo::default()
    }
  }
}

#[cfg(target_os = "linux")]
pub fn get_process_memory() -> ProcessMemoryInfo {
  use std::fs;
  if let Ok(content) = fs::read_to_string("/proc/self/statm") {
    let parts: Vec<&str> = content.split_whitespace().collect();
    if parts.len() >= 2 {
      let page_size = 4096u64;
      let total_pages: u64 = parts[0].parse().unwrap_or(0);
      let resident_pages: u64 = parts[1].parse().unwrap_or(0);
      return ProcessMemoryInfo {
        resident_bytes: resident_pages * page_size,
        virtual_bytes: total_pages * page_size,
        physical_footprint_bytes: resident_pages * page_size,
        compressed_bytes: 0,
      };
    }
  }
  ProcessMemoryInfo::default()
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[allow(non_snake_case)]
struct ProcessMemoryCountersEx {
  cb: u32,
  PageFaultCount: u32,
  PeakWorkingSetSize: usize,
  WorkingSetSize: usize,
  QuotaPeakPagedPoolUsage: usize,
  QuotaPagedPoolUsage: usize,
  QuotaPeakNonPagedPoolUsage: usize,
  QuotaNonPagedPoolUsage: usize,
  PagefileUsage: usize,
  PeakPagefileUsage: usize,
  PrivateUsage: usize,
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
  fn GetCurrentProcess() -> isize;
  fn K32GetProcessMemoryInfo(process: isize, counters: *mut ProcessMemoryCountersEx, cb: u32) -> i32;
}

/// Working set as resident, private commit as the footprint (what Task
/// Manager's commit size shows for the process).
#[cfg(target_os = "windows")]
pub fn get_process_memory() -> ProcessMemoryInfo {
  let mut c: ProcessMemoryCountersEx = unsafe { std::mem::zeroed() };
  c.cb = std::mem::size_of::<ProcessMemoryCountersEx>() as u32;
  let ok = unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb) };
  if ok == 0 {
    return ProcessMemoryInfo::default();
  }
  ProcessMemoryInfo {
    resident_bytes: c.WorkingSetSize as u64,
    virtual_bytes: c.PrivateUsage as u64,
    physical_footprint_bytes: c.PrivateUsage as u64,
    compressed_bytes: 0,
  }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub fn get_process_memory() -> ProcessMemoryInfo {
  ProcessMemoryInfo::default()
}
