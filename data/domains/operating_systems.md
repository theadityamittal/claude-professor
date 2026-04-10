---json
{
  "domain_id": "operating_systems",
  "display_name": "Operating Systems",
  "aliases": [
    "OS",
    "operating system",
    "kernel",
    "systems programming"
  ],
  "related_domains": [
    "concurrency",
    "networking",
    "performance_scalability",
    "security"
  ],
  "concept_count": 19
}
---
# Operating Systems

Kernel internals, process and memory management, file systems, system calls, and scheduling.
The layer between hardware and user-space applications.

## Boundary
- Process/thread lifecycle, scheduling algorithms, context switching → here
- Virtual memory, paging, segmentation, demand paging → here
- File systems (ext4, NTFS, ZFS), inodes, VFS → here
- System calls, POSIX APIs → here
- Kernel-space vs. user-space networking stacks → networking
- Mutex, semaphore, lock primitives at the OS level → concurrency
- CPU caches, NUMA topology, memory bandwidth → performance_scalability
- Privilege rings, capabilities, mandatory access control → security
