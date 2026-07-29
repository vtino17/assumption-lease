import { auditLeases } from "./audit.js";
import { canonicalJson, hashValue, sha256 } from "./canonical.js";
import type {
  CertificateVerification,
  LeaseAudit,
  LeaseCertificate,
  LeaseDocument,
} from "./types.js";
import { assertLeaseDocument } from "./validation.js";

export function compileReuseCertificate(input: {
  document: unknown;
  audit: LeaseAudit;
  issuedAt?: Date;
}): LeaseCertificate {
  assertLeaseDocument(input.document);
  const document = input.document;
  const expected = auditLeases(document, new Date(input.audit.auditedAt));
  if (canonicalJson(expected) !== canonicalJson(input.audit)) {
    throw new Error("Audit payload does not match a fresh evaluation of this document.");
  }
  const reusableNodeIds = input.audit.impacts.filter((entry) => entry.reusable).map((entry) => entry.nodeId);
  if (reusableNodeIds.length === 0) throw new Error("No reusable nodes can be certified.");
  const base = {
    certificateVersion: "1.0" as const,
    documentId: document.id,
    documentHash: hashValue(document),
    auditHash: input.audit.auditHash,
    auditedAt: input.audit.auditedAt,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    reusableNodeIds,
    validAssumptionIds: input.audit.assumptions.filter((entry) => entry.valid).map((entry) => entry.assumptionId),
  };
  return { ...base, certificateHash: sha256(canonicalJson(base)) };
}

export function verifyReuseCertificate(input: {
  certificate: LeaseCertificate;
  document?: unknown;
}): CertificateVerification {
  const certificate = input.certificate;
  const base = {
    certificateVersion: certificate.certificateVersion,
    documentId: certificate.documentId,
    documentHash: certificate.documentHash,
    auditHash: certificate.auditHash,
    auditedAt: certificate.auditedAt,
    issuedAt: certificate.issuedAt,
    reusableNodeIds: certificate.reusableNodeIds,
    validAssumptionIds: certificate.validAssumptionIds,
  };
  const checks = {
    certificateHash: sha256(canonicalJson(base)) === certificate.certificateHash,
    documentHash: true,
    auditHash: true,
    reusableNodes: new Set(certificate.reusableNodeIds).size === certificate.reusableNodeIds.length,
  };
  if (input.document !== undefined) {
    assertLeaseDocument(input.document);
    const document = input.document as LeaseDocument;
    const audit = auditLeases(document, new Date(certificate.auditedAt));
    const reusable = audit.impacts.filter((entry) => entry.reusable).map((entry) => entry.nodeId).sort();
    checks.documentHash = hashValue(document) === certificate.documentHash;
    checks.auditHash = audit.auditHash === certificate.auditHash;
    checks.reusableNodes = checks.reusableNodes && canonicalJson([...certificate.reusableNodeIds].sort()) === canonicalJson(reusable);
  }
  const errors = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => `${name} check failed`);
  return { valid: errors.length === 0, checks, errors };
}
