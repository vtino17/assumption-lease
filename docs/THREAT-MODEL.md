# Threat model

AssumptionLease reduces:

- reuse of plans built on expired premises;
- stale observations silently treated as current;
- contradictory environment observations;
- tampered observation payloads;
- excessive lease durations for critical assumptions;
- missing evidence for high-impact premises;
- downstream work remaining active after an upstream premise fails;
- dependency cycles and unknown references;
- policy or predicate weakening to make a failing lease pass;
- forged audit payloads and edited reuse certificates.

## Out of scope

The engine does not:

- extract every hidden assumption from natural language;
- fetch observations or execute renewal probes;
- authenticate owners, sources, or evidence references;
- prove that an observation source is truthful;
- detect semantically equivalent paths or predicates;
- replace domain tests, monitoring, or human review;
- sign certificates or provide non-repudiation.

Production systems should use signed observations, authenticated sources, protected baselines, append-only audit storage, and independent review for critical lease changes.
