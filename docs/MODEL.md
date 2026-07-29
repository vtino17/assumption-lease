# Lease model

An assumption lease is a time-bounded permission to reuse work that depends on a declared premise.

## Assumptions

Each assumption includes:

- a stable ID, statement, category, criticality, and owner;
- `assertedAt` and `validUntil`;
- an observable predicate with path, operator, and expected value;
- durable evidence references where policy requires them;
- a renewal probe that explains how to observe the premise again.

Supported operators are `equals`, `notEquals`, `greaterThan`, `lessThan`, and `includes`.

## Observations

An observation contains a path, scalar value, timestamp, source, and canonical SHA-256 digest. The latest observation must be within the freshness window and no older than the lease assertion. A digest mismatch invalidates the observation.

When recent observations for one path disagree and contention blocking is enabled, the related lease is contested.

## Dependency graph

Nodes represent plans, tasks, decisions, artifacts, and actions. `dependsOn` may reference assumptions or other nodes. Invalid assumptions propagate through these edges. Unknown references and cycles are reported explicitly.

The graph supports selective reuse: an invalid branch does not contaminate nodes with no path to the failed assumption.
