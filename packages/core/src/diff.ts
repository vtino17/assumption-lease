import { canonicalJson } from "./canonical.js";
import type { Criticality, LeaseDiff } from "./types.js";
import { assertLeaseDocument } from "./validation.js";

const rank: Record<Criticality, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function diffLeaseDocuments(fromValue: unknown, toValue: unknown): LeaseDiff {
  assertLeaseDocument(fromValue);
  assertLeaseDocument(toValue);
  const from = fromValue;
  const to = toValue;
  const weakenedControls: string[] = [];
  const strengthenedControls: string[] = [];
  if (to.policy.maxObservationAgeMinutes > from.policy.maxObservationAgeMinutes) weakenedControls.push(`Observation freshness window increased from ${from.policy.maxObservationAgeMinutes} to ${to.policy.maxObservationAgeMinutes} minutes.`);
  if (to.policy.maxObservationAgeMinutes < from.policy.maxObservationAgeMinutes) strengthenedControls.push(`Observation freshness window decreased from ${from.policy.maxObservationAgeMinutes} to ${to.policy.maxObservationAgeMinutes} minutes.`);
  for (const criticality of ["low", "medium", "high", "critical"] as Criticality[]) {
    if (to.policy.maxLeaseHours[criticality] > from.policy.maxLeaseHours[criticality]) weakenedControls.push(`${criticality} lease limit increased from ${from.policy.maxLeaseHours[criticality]}h to ${to.policy.maxLeaseHours[criticality]}h.`);
  }
  for (const level of from.policy.evidenceRequiredAt.filter((entry) => !to.policy.evidenceRequiredAt.includes(entry))) weakenedControls.push(`Evidence is no longer required for ${level} assumptions.`);
  if (from.policy.blockOnContestedObservation && !to.policy.blockOnContestedObservation) weakenedControls.push("Contested observations no longer block reuse.");
  if (from.policy.blockOnDependencyCycle && !to.policy.blockOnDependencyCycle) weakenedControls.push("Dependency cycles no longer block reuse.");
  const oldAssumptions = new Map(from.assumptions.map((entry) => [entry.id, entry]));
  const newAssumptions = new Map(to.assumptions.map((entry) => [entry.id, entry]));
  for (const [id, previous] of oldAssumptions) {
    const next = newAssumptions.get(id);
    if (!next) {
      weakenedControls.push(`Assumption "${id}" was removed.`);
      continue;
    }
    if (rank[next.criticality] < rank[previous.criticality]) weakenedControls.push(`Assumption "${id}" criticality decreased from ${previous.criticality} to ${next.criticality}.`);
    if (Date.parse(next.validUntil) > Date.parse(previous.validUntil)) weakenedControls.push(`Assumption "${id}" validity was extended.`);
    if (canonicalJson(next.predicate) !== canonicalJson(previous.predicate)) weakenedControls.push(`Assumption "${id}" predicate changed.`);
    if (next.evidenceRefs.length < previous.evidenceRefs.length) weakenedControls.push(`Assumption "${id}" lost evidence references.`);
  }
  const oldNodes = new Map(from.nodes.map((entry) => [entry.id, entry]));
  for (const node of to.nodes) {
    const previous = oldNodes.get(node.id);
    if (!previous) continue;
    for (const dependency of previous.dependsOn.filter((entry) => !node.dependsOn.includes(entry))) weakenedControls.push(`Node "${node.id}" dropped dependency "${dependency}".`);
  }
  return { from: from.id, to: to.id, weakenedControls, strengthenedControls };
}
