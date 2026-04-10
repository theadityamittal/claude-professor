---json
{
  "domain_id": "networking",
  "display_name": "Computer Networks",
  "aliases": [
    "networking",
    "networks",
    "computer networking",
    "TCP/IP",
    "protocols"
  ],
  "related_domains": [
    "distributed_systems",
    "security",
    "operating_systems",
    "reliability_observability"
  ],
  "concept_count": 16
}
---
# Computer Networks

Protocol stacks, routing, transport, application-layer protocols, and physical network topology.
How data moves reliably (or not) between machines over the internet and private networks.

## Boundary
- OSI/TCP/IP model, Ethernet, IP, TCP, UDP → here
- DNS, HTTP/1.1/2/3, TLS handshake, QUIC → here
- BGP, OSPF, routing tables, NAT, VPN tunnels → here
- Load balancing at the network layer (L4) → here
- Multi-node consensus, distributed coordination → distributed_systems
- TLS certificate management, firewall rules → security
- Kernel network stack, socket APIs → operating_systems
- Service meshes, traffic shaping for reliability → reliability_observability
