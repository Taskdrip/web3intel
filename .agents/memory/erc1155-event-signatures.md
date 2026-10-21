---
name: ERC-1155 event signature verification
description: Guardrails for decoding ERC-1155 transfer events from public EVM logs.
---

Verify `TransferSingle` and `TransferBatch` topic hashes against an authoritative source or an independently computed Keccak-256 result before wiring them into RPC filters. Hashes must contain exactly 64 hexadecimal characters after `0x`; a mistyped topic silently returns no matching events.

**Why:** The standard event hashes are easy to miscopy from memory, and a wrong filter looks like a wallet with no ERC-1155 activity rather than an obvious error.

**How to apply:** Check the event signature and indexed argument positions together, validate topic lengths, and test both single and batch decoding before relying on public RPC results.
