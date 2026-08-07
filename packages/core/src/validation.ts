import type {
  AssumptionCategory,
  Criticality,
  LeaseDocument,
  NodeKind,
  PredicateOperator,
} from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const date = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text);
const criticalities = new Set<Criticality>(["low", "medium", "high", "critical"]);
const categories = new Set<AssumptionCategory>(["environment", "dependency", "business", "data", "capability"]);
const operators = new Set<PredicateOperator>(["equals", "notEquals", "greaterThan", "lessThan", "includes"]);
const nodeKinds = new Set<NodeKind>(["plan", "task", "decision", "artifact", "action"]);

export function validateLeaseDocument(value: unknown): ValidationIssue[] {
  if (!object(value)) return [{ path: "$", message: "Lease document must be an object." }];
  const issues: ValidationIssue[] = [];
  if (value.schemaVersion !== "1.0") issues.push({ path: "schemaVersion", message: 'Must equal "1.0".' });
  for (const field of ["id", "description"] as const) {
    if (!text(value[field])) issues.push({ path: field, message: "Must be non-empty." });
  }
  if (!object(value.policy)) {
    issues.push({ path: "policy", message: "Policy is required." });
  } else {
    if (
      typeof value.policy.maxObservationAgeMinutes !== "number"
      || !Number.isFinite(value.policy.maxObservationAgeMinutes)
      || value.policy.maxObservationAgeMinutes <= 0
    ) {
      issues.push({ path: "policy.maxObservationAgeMinutes", message: "Must be positive." });
    }
    const maxLeaseHours = value.policy.maxLeaseHours;
    if (!object(maxLeaseHours) || !["low", "medium", "high", "critical"].every((key) =>
      typeof maxLeaseHours[key] === "number"
      && Number.isFinite(maxLeaseHours[key])
      && (maxLeaseHours[key] as number) > 0)) {
      issues.push({ path: "policy.maxLeaseHours", message: "Must define positive limits for every criticality." });
    }
    if (!Array.isArray(value.policy.evidenceRequiredAt) || !value.policy.evidenceRequiredAt.every((entry) => criticalities.has(entry as Criticality))) {
      issues.push({ path: "policy.evidenceRequiredAt", message: "Must contain known criticalities." });
    }
    for (const field of ["blockOnContestedObservation", "blockOnDependencyCycle"] as const) {
      if (typeof value.policy[field] !== "boolean") issues.push({ path: `policy.${field}`, message: "Must be boolean." });
    }
  }
  if (!Array.isArray(value.assumptions) || value.assumptions.length === 0) {
    issues.push({ path: "assumptions", message: "At least one assumption is required." });
  } else {
    value.assumptions.forEach((entry, index) => {
      const path = `assumptions[${index}]`;
      if (!object(entry)) {
        issues.push({ path, message: "Must be an object." });
        return;
      }
      for (const field of ["id", "statement", "owner"] as const) {
        if (!text(entry[field])) issues.push({ path: `${path}.${field}`, message: "Must be non-empty." });
      }
      if (!categories.has(entry.category as AssumptionCategory)) issues.push({ path: `${path}.category`, message: "Unknown category." });
      if (!criticalities.has(entry.criticality as Criticality)) issues.push({ path: `${path}.criticality`, message: "Unknown criticality." });
      for (const field of ["assertedAt", "validUntil"] as const) {
        if (!date(entry[field])) issues.push({ path: `${path}.${field}`, message: "Must be an ISO date." });
      }
      if (!strings(entry.evidenceRefs)) issues.push({ path: `${path}.evidenceRefs`, message: "Must be an array of strings." });
      if (!strings(entry.tags)) issues.push({ path: `${path}.tags`, message: "Must be an array of strings." });
      if (!object(entry.predicate) || !text(entry.predicate.path) || !operators.has(entry.predicate.operator as PredicateOperator) || !["string", "number", "boolean"].includes(typeof entry.predicate.expected)) {
        issues.push({ path: `${path}.predicate`, message: "Must define path, known operator, and scalar expected value." });
      }
      if (!object(entry.renewalProbe) || !["command", "http", "file", "manual"].includes(String(entry.renewalProbe.kind)) || !text(entry.renewalProbe.description) || !text(entry.renewalProbe.target)) {
        issues.push({ path: `${path}.renewalProbe`, message: "Must define kind, description, and target." });
      }
    });
  }
  if (!Array.isArray(value.observations)) {
    issues.push({ path: "observations", message: "Must be an array." });
  } else {
    value.observations.forEach((entry, index) => {
      const path = `observations[${index}]`;
      if (!object(entry)) {
        issues.push({ path, message: "Must be an object." });
        return;
      }
      for (const field of ["id", "path", "source", "digest"] as const) {
        if (!text(entry[field])) issues.push({ path: `${path}.${field}`, message: "Must be non-empty." });
      }
      if (!date(entry.observedAt)) issues.push({ path: `${path}.observedAt`, message: "Must be an ISO date." });
      if (!["string", "number", "boolean"].includes(typeof entry.value)) issues.push({ path: `${path}.value`, message: "Must be a scalar." });
    });
  }
  if (!Array.isArray(value.nodes)) {
    issues.push({ path: "nodes", message: "Must be an array." });
  } else {
    value.nodes.forEach((entry, index) => {
      const path = `nodes[${index}]`;
      if (!object(entry)) {
        issues.push({ path, message: "Must be an object." });
        return;
      }
      if (!text(entry.id) || !text(entry.label)) issues.push({ path, message: "ID and label are required." });
      if (!nodeKinds.has(entry.kind as NodeKind)) issues.push({ path: `${path}.kind`, message: "Unknown node kind." });
      if (!strings(entry.dependsOn)) issues.push({ path: `${path}.dependsOn`, message: "Must be an array of IDs." });
      if (!["proposed", "active", "completed"].includes(String(entry.status))) issues.push({ path: `${path}.status`, message: "Unknown node status." });
    });
  }
  const records = (input: unknown): Record<string, unknown>[] => Array.isArray(input) ? input.filter(object) : [];
  const assumptionIds = records(value.assumptions).map((entry) => entry.id).filter(text);
  const observationIds = records(value.observations).map((entry) => entry.id).filter(text);
  const nodeIds = records(value.nodes).map((entry) => entry.id).filter(text);
  if (new Set(assumptionIds).size !== assumptionIds.length) issues.push({ path: "assumptions", message: "Assumption IDs must be unique." });
  if (new Set(observationIds).size !== observationIds.length) issues.push({ path: "observations", message: "Observation IDs must be unique." });
  if (new Set(nodeIds).size !== nodeIds.length) issues.push({ path: "nodes", message: "Node IDs must be unique." });
  if (assumptionIds.some((id) => nodeIds.includes(id))) issues.push({ path: "nodes", message: "Node and assumption IDs must not overlap." });
  return issues;
}

export function assertLeaseDocument(value: unknown): asserts value is LeaseDocument {
  const issues = validateLeaseDocument(value);
  if (issues.length > 0) {
    throw new Error(`Invalid assumption lease:\n${issues.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n")}`);
  }
}
