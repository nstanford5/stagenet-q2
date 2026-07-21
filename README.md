This project is built on the Midnight Network.

# stagenet-q2

A stagenet testing harness for the `compact-end-2-end` dapps, modeled after
`example-usdcx`. One package: a shared `src/` harness (network config, wallet,
DUST bootstrap, providers, contract loader) plus one vitest suite per dapp under
`src/test/`. Contracts live under `contracts/<dapp>/`, compiled into
`contracts/<dapp>/managed/` by `yarn compile`.

## Layout

```
contracts/<dapp>/*.compact      # sources (per-dapp; DEX/FungibleToken names repeat)
contracts/<dapp>/managed/       # compactc output (gitignored, rebuilt by yarn compile)
src/config.ts                   # LOCAL / PREVIEW / PREPROD / STAGENET endpoints
src/wallet.ts src/dust.ts src/providers.ts   # wallet lifecycle + DUST + SDK providers
src/secret.ts src/harness.ts    # per-role secret resolution + funded/address-only helpers
src/contracts.ts                # load + bind + deploy/call/read
src/witnesses/usdcx.ts          # the only witnessed dapp's witness wiring
src/test/<dapp>.test.ts         # one end-to-end suite per dapp
```

## Setup

```sh
yarn install
cp .env.stagenet.example .env.stagenet   # fill in funded seeds (already populated here)
yarn compile                             # compile all dapps (gaps are expected)
```

`yarn compile` uses `compactc 0.33.0-rc.2` (override with `COMPACTC=/path/to/compactc`).

## Run

```sh
yarn test:stagenet     # remote node+indexer (shielded.tools), local proof server
yarn test:local        # against a local devnet on :9944 / :8088
```

The suites source secrets from `.env.<network>` via vitest's `loadEnv`. On remote
networks each **submitting** wallet must hold NIGHT and be DUST-registered (the
harness registers DUST automatically once NIGHT is present). A local proof server
is required — start it with `yarn proof:up` (stop with `yarn proof:down`).

### Wallet roles

Only the **deployer** (every dapp) and **relayer** (usdcx) submit transactions and
need funding. `trader` / `lp` / `caller_*` are *address-only* participants — the
deployer pays and submits on their behalf, so their seeds only need to derive a
distinct address (no funding). Set seeds in `.env.stagenet`.

## Dapp status (compactc 0.33.0-rc.2, stagenet)

| Dapp | Contracts | Witnesses | Status |
|------|-----------|-----------|--------|
| fungible-token | 1 | — | compiles + runs |
| events | 1 | — | compiles + runs (ledger + contract-log events) |
| no-witness-dex | 2 | — | compiles; CCC swap asserts green-or-known-callee-state-gap |
| uniswap | 3 | — | compiles; CCC swap asserts green-or-known-callee-state-gap |
| usdcx | 1 | 7 | compiles from source (`--feature-zkir-v3`); deploy + mint + replay-guard |
| eth-addr-secp | 1 | — | compiles from source (`--feature-zkir-v3`); provable secp256k1→ETH address |
| verify-sequential-secp | 1 | 6 | compiles from source (`--feature-zkir-v3`); 2×/3× ECDSA verify + reject |
| self-recursion | 1 | — | compile gap (self-interface) — suite SKIPS |
| caller | 2 | — | compile gap (kernel.caller) — suite SKIPS |
| axelar-gateway | 1 | — | compile gap (self-interface) — suite SKIPS |
| recover-secp | 1 | — | compile gap (`secp256k1EcdsaRecover` removed since rc.1) — suite SKIPS |

### secp256k1 / `--feature-zkir-v3`

The secp256k1 surface — the `Secp256k1Point` type, the `Secp256k1EcdsaSignature`
`{r,s}` struct, and the `secp256k1Ecdsa*` / `secp256k1EthereumAddress` circuits —
lives in the compiler's zkir-v3 library and is only bound with `--feature-zkir-v3`
(wired per-contract in `scripts/compile.mts`). On rc.2, usdcx, eth-addr-secp, and
verify-sequential-secp all compile **from source** to provable circuits with that
flag — no prebuilt artifact needed.

The **recover path** (`Secp256k1EcdsaSignatureWithRecovery` + `secp256k1EcdsaRecover`)
was removed between 0.33.0-rc.0 and rc.1 and is **still absent in rc.2** (unbound even
with the flag). The `recover-secp` suite is a compile-gap regression guard that runs
the moment the API is restored.
