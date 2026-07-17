// This file is part of stagenet-q2.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
//
// Compile every dapp's Compact contracts into contracts/<dapp>/managed/<Name>.
//
// Cross-contract dapps declare callee interfaces inline (`contract X { ... }`)
// and the compiler resolves them against sibling managed/<X> artifacts, so each
// dapp compiles into its OWN managed root (DEX / FungibleToken names repeat
// across dapps) and contracts compile in dependency order.
//
// Compiler: compactc 0.33.0-rc.2 (override with COMPACTC=/path/to/compactc).
// Some contracts need per-contract flags (secp256k1 dapps need --feature-zkir-v3).
// Gaps are expected — self-recursion / caller / axelar (self-interface,
// kernel.caller) and recover-secp (removed recover API) don't compile on rc.2.
// We compile every dapp regardless and report a summary; the vitest suites skip
// with a GAP banner when their artifact is missing.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS = path.join(REPO, 'contracts');
const COMPACTC = process.env.COMPACTC ?? '/home/nstan/compactc-0.33.0-rc.2/compactc';

type Contract = { source: string; managed: string; flags?: string[] };
type Dapp = { dir: string; contracts: Contract[] };

// Order within each dapp mirrors compact-end-2-end/infra/e2e.ts DAPPS.
const DAPPS: Dapp[] = [
  { dir: 'fungible-token', contracts: [{ source: 'FungibleToken', managed: 'FungibleToken' }] },
  { dir: 'events', contracts: [{ source: 'Events', managed: 'Events' }] },
  {
    dir: 'no-witness-dex',
    contracts: [
      { source: 'FungibleToken', managed: 'FungibleToken' },
      { source: 'DEX', managed: 'DEX' },
    ],
  },
  {
    dir: 'uniswap',
    contracts: [
      { source: 'USDC', managed: 'USDC' },
      { source: 'DEX', managed: 'DEX' },
      { source: 'MyToken', managed: 'MyToken' },
    ],
  },
  {
    dir: 'usdcx',
    // Compiles from source on rc.2 with --feature-zkir-v3 (the secp256k1 surface
    // lives in the zkir-v3 library). Verifies ECDSA against supplied pubkeys —
    // no recover-path primitives — so it builds cleanly.
    contracts: [
      { source: 'bridged-usdc-mint', managed: 'BridgedUsdcMint', flags: ['--feature-zkir-v3'] },
    ],
  },
  { dir: 'self-recursion', contracts: [{ source: 'SelfRecursion', managed: 'SelfRecursion' }] },
  {
    dir: 'caller',
    contracts: [
      { source: 'Caller', managed: 'Caller' },
      { source: 'Proxy', managed: 'Proxy' },
    ],
  },
  { dir: 'axelar-gateway', contracts: [{ source: 'AxelarGateway', managed: 'AxelarGateway' }] },
  {
    // Provable secp256k1 → Ethereum address. Needs --feature-zkir-v3 (the
    // secp256k1 surface lives in the compiler's zkir-v3 library; without it
    // Secp256k1Point is unbound). Provable since LFDT-Minokawa/compact#612.
    dir: 'eth-addr-secp',
    contracts: [
      { source: 'prove-eth-addr-secp', managed: 'ProveEthAddrSecp', flags: ['--feature-zkir-v3'] },
    ],
  },
  {
    // Instantiate secp256k1EcdsaVerify twice/thrice in a single circuit over one
    // digest with independent (sig, pubkey) witness pairs. Needs --feature-zkir-v3.
    dir: 'verify-sequential-secp',
    contracts: [
      {
        source: 'verify-sequential-secp',
        managed: 'VerifySequentialSecp',
        flags: ['--feature-zkir-v3'],
      },
    ],
  },
  {
    // ECDSA public-key recovery. The recover API was removed between rc.0 and
    // rc.1 and is still absent in rc.2 — this is a compile-gap regression guard
    // that compiles (and its suite runs) once the API is restored.
    dir: 'recover-secp',
    contracts: [
      { source: 'recover-secp', managed: 'RecoverSecp', flags: ['--feature-zkir-v3'] },
    ],
  },
];

if (!fs.existsSync(COMPACTC)) {
  console.error(`compactc not found at ${COMPACTC} — set COMPACTC=/path/to/compactc`);
  process.exit(1);
}

const version = spawnSync(COMPACTC, ['--version'], { encoding: 'utf8' }).stdout?.trim();
console.log(`compactc: ${COMPACTC} (${version})\n`);

const failed: string[] = [];
const compiled: string[] = [];

for (const dapp of DAPPS) {
  const dappDir = path.join(CONTRACTS, dapp.dir);
  const managedRoot = path.join(dappDir, 'managed');
  for (const c of dapp.contracts) {
    const source = path.join(dappDir, `${c.source}.compact`);
    const out = path.join(managedRoot, c.managed);
    const label = `${dapp.dir}/${c.source}`;
    fs.rmSync(out, { recursive: true, force: true });
    process.stdout.write(`  compiling ${label} ... `);
    const res = spawnSync(COMPACTC, [...(c.flags ?? []), source, out], { encoding: 'utf8' });
    if (res.status === 0) {
      console.log('ok');
      compiled.push(label);
    } else {
      console.log('FAILED');
      if (res.stderr) {
        const firstLines = res.stderr.trim().split('\n').slice(0, 4).join('\n');
        console.log(firstLines.replace(/^/gm, '      '));
      }
      failed.push(label);
      // Keep going: other dapps are independent, and gaps are expected.
    }
  }
}

console.log(`\ncompiled ${compiled.length}, failed ${failed.length}`);
if (failed.length) {
  console.log(`  gaps (expected: self-recursion / caller / axelar / recover-secp on 0.33.0-rc.2):`);
  for (const f of failed) console.log(`    - ${f}`);
}
// Always exit 0: gaps are expected and the suites gate on artifact presence.
process.exit(0);
