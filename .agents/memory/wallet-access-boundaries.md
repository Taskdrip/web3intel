---
name: Wallet access boundaries
description: Product decision for wallet connections and custody in Web3 Intelligence.
---

Wallet access is non-custodial: connect wallets that users control only to read a public address and active network. Do not collect or store private keys or seed phrases, request signatures, or initiate transactions. The initial connection surface covers EVM networks and Solana; manual public-address balance lookup remains available on eight networks. Custody, if considered later, requires a selected audited provider and a separate user decision.

**Why:** The user chose connecting existing wallets rather than building an in-app custodial wallet.

**How to apply:** Preserve this boundary in future wallet and account features. Distinguish address-scanner network coverage from actual wallet connector coverage.
