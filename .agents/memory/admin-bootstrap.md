---
name: Admin bootstrap identity
description: Security rule for granting the first administrator role.
---

Grant initial administrator access only to an existing account whose primary Clerk email is verified. Do not grant admin based solely on a public wallet address; wallet-only promotion requires a fresh, verified proof of wallet ownership.

**Why:** A wallet address is public and does not establish that the requester controls it.

**How to apply:** Use the verified-email promotion flow for initial setup. If adding wallet-based admin bootstrap later, require an authenticated SIWE proof before assigning the role.
