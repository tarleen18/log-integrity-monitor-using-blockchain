# Project Report: Blockchain-Based Log Integrity Monitor

## Problem Statement
When a system is compromised, attackers commonly alter or delete server logs
to erase evidence of their activity — a technique known as **log tampering**,
part of the "defense evasion" stage of most attack frameworks (e.g. MITRE
ATT&CK T1070: Indicator Removal). Traditional logging systems have no
mechanism to prove, after the fact, whether logs were altered.

## Proposed Solution
This project anchors cryptographic fingerprints (Merkle root hashes) of log
batches onto a public blockchain (Ethereum, Sepolia testnet). Because
blockchain records are immutable and publicly verifiable, any later mismatch
between a re-computed log hash and its on-chain anchor is provable, undeniable
evidence of tampering — with an exact timestamp of the last known-good state.

Crucially, the logs themselves never leave the organization's infrastructure:
only a 32-byte hash is published, preserving confidentiality while gaining
public verifiability.

## System Components
1. **Merkle Tree Hasher** — converts a batch of log lines into a single root hash
2. **Smart Contract (Solidity)** — stores hash + timestamp + submitter immutably
3. **Automated Watcher** — anchors new log batches on a fixed schedule, unattended
4. **Verification API & Dashboard** — re-hashes current logs and checks against
   the blockchain record, flagging any mismatch instantly

## Real-World Applicability
- **SOC/SIEM tooling**: security teams can prove log integrity during breach
  investigations
- **Regulatory compliance**: HIPAA, PCI-DSS, and SOX all require tamper-evident
  audit trails
- **Digital forensics**: provides timestamped, court-admissible proof of
  chain-of-custody for digital evidence
- **Cloud/SaaS providers**: can offer "verifiable log integrity" as a trust
  and compliance feature to enterprise customers

## Why Blockchain (and not just a hash stored in a database)?
A hash stored in a normal database can itself be altered by whoever controls
that database (including a compromised admin account). Anchoring the hash on
a public blockchain removes this single point of failure — no one, including
the organization itself, can retroactively rewrite the anchored value.

## Testing & Validation
- Automated unit tests confirm the smart contract correctly stores anchors,
  restricts write access to an authorized address, and correctly flags matching
  vs. non-matching hashes
- End-to-end demo: an original log file is anchored, a line is deleted to
  simulate an attacker, and the verification step correctly detects the change

## Limitations & Future Work
- Detection is bounded by the anchoring interval — tampering between anchors
  is only caught at the next verification, not in real time
- Gas costs, while small, scale with anchor frequency — a Layer 2 (e.g.
  Polygon, Arbitrum) could reduce costs further for high-frequency anchoring
- Future work: integrate with a real SIEM (e.g. Wazuh, Splunk) via its log
  export API for production-scale ingestion
