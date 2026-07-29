# Integration guide

## Recommended lifecycle

1. Require the planning agent to declare assumptions before execution.
2. Map every premise to a machine-readable observation path.
3. Set shorter leases for high-impact assumptions.
4. Record dependency edges as plans create tasks, decisions, actions, and artifacts.
5. Refresh observations from authoritative tools.
6. Run `audit` before resuming or reusing prior work.
7. Use `renewals` to obtain targeted probes.
8. Execute probes in the appropriate trusted system, then append new signed observations.
9. Certify only reusable nodes.

AssumptionLease describes probes but never executes them. This separation prevents an audit tool from silently gaining command or network authority.

## CI gate

```yaml
- name: Reject assumption-contract regression
  run: assumption-lease diff leases/baseline.json leases/current.json

- name: Audit current premises
  run: assumption-lease audit leases/current.json --at "$RUN_TIMESTAMP"

- name: Certify reusable work
  run: assumption-lease certify leases/current.json \
    --at "$RUN_TIMESTAMP" \
    --output artifacts/reuse-certificate.json
```

Protect the baseline with code review. Do not let the same agent change a failed predicate, extend its lease, and approve the resulting plan.
