import type { LeaseAudit, RenewalPlan } from "./types.js";
import { assertLeaseDocument } from "./validation.js";

export function buildRenewalPlan(
  value: unknown,
  audit: LeaseAudit
): RenewalPlan {
  assertLeaseDocument(value);
  const document = value;
  if (audit.documentId !== document.id) throw new Error("Audit belongs to another document.");
  const impacts = new Map<string, string[]>();
  for (const entry of audit.impacts) {
    for (const assumptionId of entry.invalidatedBy) {
      const nodes = impacts.get(assumptionId) ?? [];
      nodes.push(entry.nodeId);
      impacts.set(assumptionId, nodes);
    }
  }
  return {
    documentId: document.id,
    generatedAt: audit.auditedAt,
    items: audit.assumptions
      .filter((entry) => !entry.valid)
      .map((entry) => {
        const assumption = document.assumptions.find((candidate) => candidate.id === entry.assumptionId)!;
        return {
          assumptionId: assumption.id,
          priority: assumption.criticality,
          reason: entry.status,
          probe: assumption.renewalProbe,
          impactedNodes: impacts.get(assumption.id) ?? [],
        };
      }),
  };
}
