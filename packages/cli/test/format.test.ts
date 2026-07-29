import { describe, expect, it } from "vitest";
import {
  auditLeases,
  buildRenewalPlan,
  createDriftedLease,
  createSoundLease,
  createWeakenedLease,
  diffLeaseDocuments,
} from "@assumptionlease/core";
import { formatAudit, formatDiff, formatRenewalPlan } from "../src/format.js";

const now = new Date("2026-07-29T06:00:00.000Z");

describe("CLI formatting", () => {
  it("renders audit and transitive impact", () => {
    expect(formatAudit(auditLeases(createSoundLease(now), now))).toContain("Status: SOUND");
  });

  it("renders renewal probes", () => {
    const document = createDriftedLease(now);
    const output = formatRenewalPlan(buildRenewalPlan(document, auditLeases(document, now)));
    expect(output).toContain("Probe (http)");
  });

  it("renders lease weakening", () => {
    expect(formatDiff(diffLeaseDocuments(createSoundLease(), createWeakenedLease()))).toContain("dropped dependency");
  });
});
