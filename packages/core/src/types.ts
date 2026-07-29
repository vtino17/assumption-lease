export type Criticality = "low" | "medium" | "high" | "critical";
export type AssumptionCategory =
  | "environment"
  | "dependency"
  | "business"
  | "data"
  | "capability";
export type PredicateOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan"
  | "includes";
export type NodeKind = "plan" | "task" | "decision" | "artifact" | "action";

export interface AssumptionPredicate {
  path: string;
  operator: PredicateOperator;
  expected: string | number | boolean;
}

export interface RenewalProbe {
  kind: "command" | "http" | "file" | "manual";
  description: string;
  target: string;
}

export interface Assumption {
  id: string;
  statement: string;
  category: AssumptionCategory;
  criticality: Criticality;
  owner: string;
  assertedAt: string;
  validUntil: string;
  predicate: AssumptionPredicate;
  evidenceRefs: string[];
  tags: string[];
  renewalProbe: RenewalProbe;
}

export interface Observation {
  id: string;
  path: string;
  value: string | number | boolean;
  observedAt: string;
  source: string;
  digest: string;
}

export interface DependentNode {
  id: string;
  kind: NodeKind;
  label: string;
  dependsOn: string[];
  status: "proposed" | "active" | "completed";
}

export interface LeasePolicy {
  maxObservationAgeMinutes: number;
  maxLeaseHours: Record<Criticality, number>;
  evidenceRequiredAt: Criticality[];
  blockOnContestedObservation: boolean;
  blockOnDependencyCycle: boolean;
}

export interface LeaseDocument {
  schemaVersion: "1.0";
  id: string;
  description: string;
  policy: LeasePolicy;
  assumptions: Assumption[];
  observations: Observation[];
  nodes: DependentNode[];
}

export type AssumptionStatus =
  | "valid"
  | "expired"
  | "unobserved"
  | "stale"
  | "violated"
  | "contested"
  | "overlong";

export interface LeaseIssue {
  code: string;
  severity: "warning" | "invalid";
  message: string;
  assumptionId?: string;
  nodeId?: string;
}

export interface AssumptionAudit {
  assumptionId: string;
  status: AssumptionStatus;
  valid: boolean;
  observationId?: string;
  ageMinutes?: number;
  remainingMinutes: number;
  issues: LeaseIssue[];
}

export interface NodeImpact {
  nodeId: string;
  reusable: boolean;
  invalidatedBy: string[];
  depth: number;
}

export interface LeaseAudit {
  documentId: string;
  status: "sound" | "degraded" | "invalid";
  validAssumptions: number;
  invalidAssumptions: number;
  reusableNodes: number;
  invalidatedNodes: number;
  assumptions: AssumptionAudit[];
  impacts: NodeImpact[];
  issues: LeaseIssue[];
  auditedAt: string;
  auditHash: string;
}

export interface RenewalItem {
  assumptionId: string;
  priority: Criticality;
  reason: AssumptionStatus;
  probe: RenewalProbe;
  impactedNodes: string[];
}

export interface RenewalPlan {
  documentId: string;
  generatedAt: string;
  items: RenewalItem[];
}

export interface LeaseCertificate {
  certificateVersion: "1.0";
  documentId: string;
  documentHash: string;
  auditHash: string;
  auditedAt: string;
  issuedAt: string;
  reusableNodeIds: string[];
  validAssumptionIds: string[];
  certificateHash: string;
}

export interface CertificateVerification {
  valid: boolean;
  checks: {
    certificateHash: boolean;
    documentHash: boolean;
    auditHash: boolean;
    reusableNodes: boolean;
  };
  errors: string[];
}

export interface LeaseDiff {
  from: string;
  to: string;
  weakenedControls: string[];
  strengthenedControls: string[];
}
