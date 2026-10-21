---
name: Sui public data API
description: Availability and constraints for public Sui mainnet data access.
---

Sui Foundation Mainnet full-node JSON-RPC was disabled during the week of July 27, 2026; legacy balance calls return “Method not found.” The official public GraphQL endpoint is available but rate-limited, so production traffic may need a dedicated provider or self-hosted service.

**Why:** The former public endpoint stopped serving the balance method during this project setup.

**How to apply:** Do not restore the legacy JSON-RPC balance call. Use the current GraphQL interface or a configurable provider, and keep provider failures visible rather than substituting estimated data.
