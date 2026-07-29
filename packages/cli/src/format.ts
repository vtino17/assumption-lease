import type {
  LeaseAudit,
  LeaseDiff,
  RenewalPlan,
} from "@assumptionlease/core";

export function formatAudit(audit: LeaseAudit): string {
  const lines = [
    `AssumptionLease · ${audit.documentId}`,
    `Status: ${audit.status.toUpperCase()} · ${audit.validAssumptions} valid assumptions · ${audit.invalidatedNodes} invalidated nodes`,
    "",
  ];
  for (const entry of audit.assumptions) {
    lines.push(`${entry.valid ? "✓" : "×"} ${entry.assumptionId} · ${entry.status.toUpperCase()} · ${entry.remainingMinutes}m remaining`);
    for (const problem of entry.issues) lines.push(`  ${problem.severity.toUpperCase()} ${problem.code}: ${problem.message}`);
  }
  lines.push("", "Impact graph");
  for (const impact of audit.impacts) {
    lines.push(`${impact.reusable ? "✓" : "×"} ${impact.nodeId} · ${impact.reusable ? "REUSABLE" : `invalidated by ${impact.invalidatedBy.join(", ")}`}`);
  }
  return lines.join("\n");
}

export function formatRenewalPlan(plan: RenewalPlan): string {
  const lines = [`Renewal plan · ${plan.documentId}`, `Items: ${plan.items.length}`, ""];
  for (const item of plan.items) {
    lines.push(
      `${item.priority.toUpperCase()} ${item.assumptionId} · ${item.reason}`,
      `  Probe (${item.probe.kind}): ${item.probe.description}`,
      `  Target: ${item.probe.target}`,
      `  Impact: ${item.impactedNodes.join(", ") || "none"}`
    );
  }
  return lines.join("\n");
}

export function formatDiff(diff: LeaseDiff): string {
  return [
    `Lease diff: ${diff.from} → ${diff.to}`,
    `Weakened controls: ${diff.weakenedControls.length}`,
    ...diff.weakenedControls.map((entry) => `- ${entry}`),
    "",
    `Strengthened controls: ${diff.strengthenedControls.length}`,
    ...diff.strengthenedControls.map((entry) => `+ ${entry}`),
  ].join("\n");
}
