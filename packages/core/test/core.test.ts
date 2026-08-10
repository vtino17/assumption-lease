import { describe, expect, it } from "vitest";
import {
  auditLeases,
  buildRenewalPlan,
  compileReuseCertificate,
  createDriftedLease,
  createSoundLease,
  createWeakenedLease,
  diffLeaseDocuments,
  hashValue,
  sha256,
  validateLeaseDocument,
  verifyReuseCertificate,
} from "../src/index.js";

const now = new Date("2026-07-29T06:00:00.000Z");

describe("canonical hashing", () => {
  it("implements the SHA-256 known vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes object keys canonically", () => {
    expect(hashValue({ one: 1, two: 2 })).toBe(hashValue({ two: 2, one: 1 }));
  });
});

describe("lease auditing", () => {
  it("accepts current, observed assumptions", () => {
    const audit = auditLeases(createSoundLease(now), now);
    expect(audit.status).toBe("sound");
    expect(audit.validAssumptions).toBe(3);
    expect(audit.reusableNodes).toBe(4);
  });

  it("detects contested and violated assumptions", () => {
    const audit = auditLeases(createDriftedLease(now), now);
    expect(audit.status).toBe("invalid");
    expect(audit.issues.some((entry) => entry.code === "contested-observation")).toBe(true);
    expect(audit.issues.some((entry) => entry.code === "predicate-violated")).toBe(true);
  });

  it("propagates invalidation transitively while preserving independent artifacts", () => {
    const audit = auditLeases(createDriftedLease(now), now);
    expect(audit.impacts.find((entry) => entry.nodeId === "decision-customer-notice")?.invalidatedBy).toEqual([
      "assumption-api-v3",
      "assumption-error-budget",
    ]);
    expect(audit.impacts.find((entry) => entry.nodeId === "artifact-budget-report")?.reusable).toBe(true);
  });

  it("detects stale observations", () => {
    const document = createSoundLease(now);
    document.observations[0]!.observedAt = "2026-07-29T03:00:00.000Z";
    document.observations[0]!.digest = hashValue({ ...document.observations[0]!, digest: undefined });
    expect(auditLeases(document, now).issues.some((entry) => entry.code === "stale-observation")).toBe(true);
  });

  it("detects expired and overlong leases", () => {
    const document = createSoundLease(now);
    document.assumptions[0]!.validUntil = "2026-07-29T05:00:00.000Z";
    document.assumptions[1]!.validUntil = "2026-08-29T06:00:00.000Z";
    const audit = auditLeases(document, now);
    expect(audit.issues.some((entry) => entry.code === "expired-assumption")).toBe(true);
    expect(audit.issues.some((entry) => entry.code === "overlong-lease")).toBe(true);
  });

  it("detects missing observations and evidence", () => {
    const document = createSoundLease(now);
    document.observations = document.observations.filter((entry) => entry.path !== "api.checkout.version");
    document.assumptions[0]!.evidenceRefs = [];
    const codes = auditLeases(document, now).issues.map((entry) => entry.code);
    expect(codes).toContain("missing-observation");
    expect(codes).toContain("missing-evidence-reference");
  });

  it("detects observation tampering", () => {
    const document = createSoundLease(now);
    document.observations[0]!.value = "v2";
    expect(auditLeases(document, now).issues.some((entry) => entry.code === "observation-digest-mismatch")).toBe(true);
  });

  it("detects unknown dependencies", () => {
    const document = createSoundLease(now);
    document.nodes[0]!.dependsOn.push("missing-assumption");
    expect(auditLeases(document, now).issues.some((entry) => entry.code === "unknown-dependency")).toBe(true);
  });

  it("detects dependency cycles", () => {
    const document = createSoundLease(now);
    document.nodes[0]!.dependsOn.push("decision-customer-notice");
    expect(auditLeases(document, now).issues.some((entry) => entry.code === "dependency-cycle")).toBe(true);
  });
});

describe("renewal planning", () => {
  it("turns invalid assumptions into executable probe guidance", () => {
    const document = createDriftedLease(now);
    const plan = buildRenewalPlan(document, auditLeases(document, now));
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]!.impactedNodes.length).toBeGreaterThan(0);
  });
});

describe("reuse certificates", () => {
  it("certifies and verifies reusable nodes", () => {
    const document = createDriftedLease(now);
    const audit = auditLeases(document, now);
    const certificate = compileReuseCertificate({ document, audit, issuedAt: now });
    expect(certificate.reusableNodeIds).toEqual(["artifact-budget-report"]);
    expect(verifyReuseCertificate({ certificate, document }).valid).toBe(true);
  });

  it("detects certificate tampering", () => {
    const document = createSoundLease(now);
    const audit = auditLeases(document, now);
    const certificate = compileReuseCertificate({ document, audit, issuedAt: now });
    certificate.reusableNodeIds.pop();
    expect(verifyReuseCertificate({ certificate, document }).valid).toBe(false);
  });

  it("refuses forged audits", () => {
    const document = createSoundLease(now);
    const audit = auditLeases(document, now);
    audit.reusableNodes = 0;
    expect(() => compileReuseCertificate({ document, audit })).toThrow("does not match");
  });
});

describe("lease regression", () => {
  it("reports weakened policies, assumptions, and graph edges", () => {
    const diff = diffLeaseDocuments(createSoundLease(), createWeakenedLease());
    expect(diff.weakenedControls.length).toBeGreaterThanOrEqual(10);
  });
});

describe("validation", () => {
  it("rejects duplicate IDs and malformed policy limits", () => {
    const document = createSoundLease(now);
    document.assumptions.push(document.assumptions[0]!);
    document.policy.maxObservationAgeMinutes = 0;
    const paths = validateLeaseDocument(document).map((entry) => entry.path);
    expect(paths).toContain("assumptions");
    expect(paths).toContain("policy.maxObservationAgeMinutes");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite observation age limits (%s)",
    (maxObservationAgeMinutes) => {
      const document = createSoundLease(now);
      document.policy.maxObservationAgeMinutes = maxObservationAgeMinutes;
      expect(validateLeaseDocument(document).map((entry) => entry.path))
        .toContain("policy.maxObservationAgeMinutes");
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite lease duration limits (%s)",
    (critical) => {
      const document = createSoundLease(now);
      document.policy.maxLeaseHours.critical = critical;
      expect(validateLeaseDocument(document).map((entry) => entry.path))
        .toContain("policy.maxLeaseHours");
    },
  );
});
