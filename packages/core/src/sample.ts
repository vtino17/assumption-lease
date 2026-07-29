import { hashValue } from "./canonical.js";
import type {
  LeaseDocument,
  Observation,
} from "./types.js";

const at = (now: Date, minutes: number): string =>
  new Date(now.getTime() + minutes * 60_000).toISOString();
const observation = (
  input: Omit<Observation, "digest">
): Observation => ({ ...input, digest: hashValue(input) });

export function createSoundLease(
  now = new Date("2026-07-29T06:00:00.000Z")
): LeaseDocument {
  return {
    schemaVersion: "1.0",
    id: "checkout-release-assumptions",
    description: "Assumptions behind the checkout v3 rollout plan.",
    policy: {
      maxObservationAgeMinutes: 60,
      maxLeaseHours: { low: 720, medium: 168, high: 72, critical: 24 },
      evidenceRequiredAt: ["high", "critical"],
      blockOnContestedObservation: true,
      blockOnDependencyCycle: true,
    },
    assumptions: [
      {
        id: "assumption-api-v3",
        statement: "The checkout API exposes version v3.",
        category: "dependency",
        criticality: "critical",
        owner: "release-agent",
        assertedAt: at(now, -120),
        validUntil: at(now, 360),
        predicate: { path: "api.checkout.version", operator: "equals", expected: "v3" },
        evidenceRefs: ["https://api.example/openapi/v3.json"],
        tags: ["checkout", "api"],
        renewalProbe: { kind: "http", description: "Fetch the checkout API version endpoint.", target: "https://api.example/version" },
      },
      {
        id: "assumption-error-budget",
        statement: "Checkout error rate remains below two percent.",
        category: "environment",
        criticality: "high",
        owner: "sre-agent",
        assertedAt: at(now, -90),
        validUntil: at(now, 60),
        predicate: { path: "metrics.checkout.errorRate", operator: "lessThan", expected: 0.02 },
        evidenceRefs: ["https://metrics.example/checkout/error-rate"],
        tags: ["checkout", "slo"],
        renewalProbe: { kind: "http", description: "Query the current checkout error rate.", target: "https://metrics.example/api/checkout" },
      },
      {
        id: "assumption-budget",
        statement: "The rollout budget retains more than 1,000 credits.",
        category: "business",
        criticality: "medium",
        owner: "finance-agent",
        assertedAt: at(now, -60),
        validUntil: at(now, 2_880),
        predicate: { path: "budget.rollout.remaining", operator: "greaterThan", expected: 1_000 },
        evidenceRefs: [],
        tags: ["budget"],
        renewalProbe: { kind: "command", description: "Read the rollout budget balance.", target: "budgetctl balance rollout" },
      },
    ],
    observations: [
      observation({ id: "obs-api-v3", path: "api.checkout.version", value: "v3", observedAt: at(now, -12), source: "service:api-registry" }),
      observation({ id: "obs-error-rate", path: "metrics.checkout.errorRate", value: 0.008, observedAt: at(now, -5), source: "service:metrics" }),
      observation({ id: "obs-budget", path: "budget.rollout.remaining", value: 2_400, observedAt: at(now, -20), source: "service:budget" }),
    ],
    nodes: [
      { id: "plan-checkout-rollout", kind: "plan", label: "Checkout v3 rollout plan", dependsOn: ["assumption-api-v3", "assumption-error-budget"], status: "active" },
      { id: "task-production-migration", kind: "task", label: "Run production migration", dependsOn: ["plan-checkout-rollout", "assumption-budget"], status: "proposed" },
      { id: "decision-customer-notice", kind: "decision", label: "Send customer migration notice", dependsOn: ["task-production-migration"], status: "proposed" },
      { id: "artifact-budget-report", kind: "artifact", label: "Rollout budget report", dependsOn: ["assumption-budget"], status: "completed" },
    ],
  };
}

export function createDriftedLease(
  now = new Date("2026-07-29T06:00:00.000Z")
): LeaseDocument {
  const document = createSoundLease(now);
  document.id = "checkout-release-assumptions-drifted";
  document.observations = document.observations.map((entry) =>
    entry.id === "obs-error-rate"
      ? observation({
          id: entry.id,
          path: entry.path,
          value: 0.08,
          observedAt: at(now, -3),
          source: entry.source,
        })
      : entry
  );
  document.observations.push(
    observation({
      id: "obs-api-v2-conflict",
      path: "api.checkout.version",
      value: "v2",
      observedAt: at(now, -2),
      source: "service:deployment",
    })
  );
  return document;
}

export function createWeakenedLease(): LeaseDocument {
  const document = createSoundLease();
  document.id = "checkout-release-assumptions-weakened";
  document.policy.maxObservationAgeMinutes = 240;
  document.policy.maxLeaseHours.critical = 168;
  document.policy.evidenceRequiredAt = [];
  document.policy.blockOnContestedObservation = false;
  document.policy.blockOnDependencyCycle = false;
  document.assumptions[0]!.criticality = "medium";
  document.assumptions[0]!.validUntil = "2026-08-29T06:00:00.000Z";
  document.assumptions[0]!.predicate.expected = "v2";
  document.assumptions[0]!.evidenceRefs = [];
  document.nodes[0]!.dependsOn = ["assumption-error-budget"];
  return document;
}
