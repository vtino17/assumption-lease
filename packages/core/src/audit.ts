import { canonicalJson, hashValue } from "./canonical.js";
import type {
  Assumption,
  AssumptionAudit,
  LeaseAudit,
  LeaseIssue,
  NodeImpact,
  Observation,
  PredicateOperator,
} from "./types.js";
import { assertLeaseDocument } from "./validation.js";

const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
const normalize = (value: unknown): string =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().toLowerCase()
    : canonicalJson(value);

function compare(
  actual: string | number | boolean,
  operator: PredicateOperator,
  expected: string | number | boolean
): boolean {
  if (operator === "equals") return normalize(actual) === normalize(expected);
  if (operator === "notEquals") return normalize(actual) !== normalize(expected);
  if (operator === "includes") return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  return operator === "greaterThan" ? actual > expected : actual < expected;
}

const severity = (assumption: Assumption): LeaseIssue["severity"] =>
  rank[assumption.criticality] >= rank.high ? "invalid" : "warning";

function issue(
  code: string,
  level: LeaseIssue["severity"],
  message: string,
  target?: { assumptionId?: string; nodeId?: string }
): LeaseIssue {
  return { code, severity: level, message, ...target };
}

function observationHash(observation: Observation): string {
  return hashValue({
    id: observation.id,
    path: observation.path,
    value: observation.value,
    observedAt: observation.observedAt,
    source: observation.source,
  });
}

function findCycles(nodes: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const dependency of nodes.get(id) ?? []) {
      if (nodes.has(dependency)) visit(dependency);
    }
    stack.pop();
    active.delete(id);
  };
  for (const id of nodes.keys()) visit(id);
  return cycles;
}

export function auditLeases(value: unknown, now = new Date()): LeaseAudit {
  assertLeaseDocument(value);
  const document = value;
  const audits: AssumptionAudit[] = document.assumptions.map((assumption) => {
    const issues: LeaseIssue[] = [];
    const level = severity(assumption);
    const all = document.observations
      .filter((entry) => entry.path === assumption.predicate.path && Date.parse(entry.observedAt) <= now.getTime())
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
    const latest = all[0];
    const ageMinutes = latest ? (now.getTime() - Date.parse(latest.observedAt)) / 60_000 : undefined;
    const recent = all.filter((entry) => (now.getTime() - Date.parse(entry.observedAt)) / 60_000 <= document.policy.maxObservationAgeMinutes);
    const contested = new Set(recent.map((entry) => normalize(entry.value))).size > 1;
    const leaseHours = (Date.parse(assumption.validUntil) - Date.parse(assumption.assertedAt)) / 3_600_000;
    const remainingMinutes = Math.floor((Date.parse(assumption.validUntil) - now.getTime()) / 60_000);
    let status: AssumptionAudit["status"] = "valid";
    if (leaseHours > document.policy.maxLeaseHours[assumption.criticality]) {
      status = "overlong";
      issues.push(issue("overlong-lease", level, `Lease duration ${leaseHours}h exceeds the ${assumption.criticality} limit of ${document.policy.maxLeaseHours[assumption.criticality]}h.`, { assumptionId: assumption.id }));
    }
    if (remainingMinutes < 0) {
      status = "expired";
      issues.push(issue("expired-assumption", level, "Assumption lease has expired.", { assumptionId: assumption.id }));
    } else if (!latest) {
      status = "unobserved";
      issues.push(issue("missing-observation", level, `No observation exists for "${assumption.predicate.path}".`, { assumptionId: assumption.id }));
    } else if (latest.digest !== observationHash(latest)) {
      status = "violated";
      issues.push(issue("observation-digest-mismatch", "invalid", `Observation "${latest.id}" does not match its digest.`, { assumptionId: assumption.id }));
    } else if (contested && document.policy.blockOnContestedObservation) {
      status = "contested";
      issues.push(issue("contested-observation", level, `${recent.length} recent observations disagree on "${assumption.predicate.path}".`, { assumptionId: assumption.id }));
    } else if (ageMinutes! > document.policy.maxObservationAgeMinutes || Date.parse(latest.observedAt) < Date.parse(assumption.assertedAt)) {
      status = "stale";
      issues.push(issue("stale-observation", level, `Observation is ${Math.floor(ageMinutes!)} minutes old or predates the lease.`, { assumptionId: assumption.id }));
    } else if (!compare(latest.value, assumption.predicate.operator, assumption.predicate.expected)) {
      status = "violated";
      issues.push(issue("predicate-violated", level, `Observed value ${JSON.stringify(latest.value)} does not satisfy ${assumption.predicate.operator} ${JSON.stringify(assumption.predicate.expected)}.`, { assumptionId: assumption.id }));
    }
    if (document.policy.evidenceRequiredAt.includes(assumption.criticality) && assumption.evidenceRefs.length === 0) {
      if (status === "valid") status = "unobserved";
      issues.push(issue("missing-evidence-reference", level, "Lease requires at least one durable evidence reference.", { assumptionId: assumption.id }));
    }
    return {
      assumptionId: assumption.id,
      status,
      valid: issues.length === 0,
      ...(latest ? { observationId: latest.id } : {}),
      ...(ageMinutes !== undefined ? { ageMinutes: Math.floor(ageMinutes) } : {}),
      remainingMinutes,
      issues,
    };
  });
  const assumptionMap = new Map(audits.map((entry) => [entry.assumptionId, entry]));
  const nodeMap = new Map(document.nodes.map((entry) => [entry.id, entry]));
  const graph = new Map(document.nodes.map((entry) => [entry.id, entry.dependsOn]));
  const cycles = findCycles(graph);
  const cycleNodes = new Set(cycles.flat());
  const graphIssues: LeaseIssue[] = [];
  for (const node of document.nodes) {
    for (const dependency of node.dependsOn) {
      if (!assumptionMap.has(dependency) && !nodeMap.has(dependency)) {
        graphIssues.push(issue("unknown-dependency", "invalid", `Dependency "${dependency}" does not exist.`, { nodeId: node.id }));
      }
    }
  }
  for (const cycle of cycles) {
    graphIssues.push(issue("dependency-cycle", document.policy.blockOnDependencyCycle ? "invalid" : "warning", `Dependency cycle: ${cycle.join(" → ")}.`));
  }
  const memo = new Map<string, NodeImpact>();
  const impact = (id: string, visiting = new Set<string>()): NodeImpact => {
    const cached = memo.get(id);
    if (cached) return cached;
    const node = nodeMap.get(id)!;
    const invalidated = new Set<string>();
    let depth = 0;
    if (cycleNodes.has(id) && document.policy.blockOnDependencyCycle) invalidated.add("dependency-cycle");
    if (visiting.has(id)) return { nodeId: id, reusable: false, invalidatedBy: ["dependency-cycle"], depth: 0 };
    const next = new Set(visiting);
    next.add(id);
    for (const dependency of node.dependsOn) {
      const assumption = assumptionMap.get(dependency);
      if (assumption && !assumption.valid) invalidated.add(dependency);
      const dependentNode = nodeMap.get(dependency);
      if (dependentNode) {
        const parent = impact(dependentNode.id, next);
        parent.invalidatedBy.forEach((entry) => invalidated.add(entry));
        depth = Math.max(depth, parent.depth + 1);
      }
      if (!assumption && !dependentNode) invalidated.add(`unknown:${dependency}`);
    }
    const result = { nodeId: id, reusable: invalidated.size === 0, invalidatedBy: [...invalidated].sort(), depth };
    memo.set(id, result);
    return result;
  };
  const impacts: NodeImpact[] = document.nodes.map((node) => impact(node.id));
  const allIssues = [...audits.flatMap((entry) => entry.issues), ...graphIssues];
  const invalidCritical = audits.some((entry) => !entry.valid && severity(document.assumptions.find((assumption) => assumption.id === entry.assumptionId)!) === "invalid");
  const globalInvalid = graphIssues.some((entry) => entry.severity === "invalid");
  const base = {
    documentId: document.id,
    status: (invalidCritical || globalInvalid ? "invalid" : allIssues.length > 0 ? "degraded" : "sound") as LeaseAudit["status"],
    validAssumptions: audits.filter((entry) => entry.valid).length,
    invalidAssumptions: audits.filter((entry) => !entry.valid).length,
    reusableNodes: impacts.filter((entry) => entry.reusable).length,
    invalidatedNodes: impacts.filter((entry) => !entry.reusable).length,
    assumptions: audits,
    impacts,
    issues: allIssues,
    auditedAt: now.toISOString(),
  };
  return { ...base, auditHash: hashValue(base) };
}
