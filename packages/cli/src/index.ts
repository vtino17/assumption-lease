#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  auditLeases,
  buildRenewalPlan,
  compileReuseCertificate,
  createSoundLease,
  diffLeaseDocuments,
  verifyReuseCertificate,
} from "@assumptionlease/core";
import type { LeaseCertificate } from "@assumptionlease/core";
import { formatAudit, formatDiff, formatRenewalPlan } from "./format.js";

const help = `AssumptionLease — expiring assumptions for long-running agents

Usage:
  assumption-lease audit <lease.json> [--at <ISO date>] [--json]
  assumption-lease impact <lease.json> --node <id> [--at <ISO date>]
  assumption-lease renewals <lease.json> [--at <ISO date>] [--json]
  assumption-lease certify <lease.json> --output <certificate.json> [--at <ISO date>]
  assumption-lease verify <certificate.json> [--lease <lease.json>]
  assumption-lease diff <previous.json> <next.json> [--json]
  assumption-lease init [path]

Exit codes: 0 sound/valid, 2 invalid, 3 degraded, 4 weakened contract, 5 invalid input.`;

const option = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
const outputJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
const at = (args: string[]): Date => {
  const input = option(args, "--at");
  if (!input) return new Date();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid --at date: ${input}`);
  return date;
};

async function run(args: string[]): Promise<number> {
  const [command, first, second] = args;
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(help);
    return 0;
  }
  if (command === "init") {
    const path = resolve(first ?? "assumption-lease.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(createSoundLease(), null, 2)}\n`, "utf8");
    console.log(`Created ${path}`);
    return 0;
  }
  if (["audit", "impact", "renewals", "certify"].includes(command)) {
    if (!first || first.startsWith("--")) throw new Error(`${command} requires a lease path.`);
    const document = await readJson(first);
    const audit = auditLeases(document, at(args));
    if (command === "audit") {
      if (args.includes("--json")) outputJson(audit);
      else console.log(formatAudit(audit));
    }
    if (command === "impact") {
      const nodeId = option(args, "--node");
      if (!nodeId) throw new Error("impact requires --node <id>.");
      const impact = audit.impacts.find((entry) => entry.nodeId === nodeId);
      if (!impact) throw new Error(`Unknown node: ${nodeId}`);
      outputJson(impact);
    }
    if (command === "renewals") {
      const plan = buildRenewalPlan(document, audit);
      if (args.includes("--json")) outputJson(plan);
      else console.log(formatRenewalPlan(plan));
    }
    if (command === "certify") {
      const output = option(args, "--output");
      if (!output) throw new Error("certify requires --output <certificate.json>.");
      const certificate = compileReuseCertificate({ document, audit, issuedAt: at(args) });
      await mkdir(dirname(resolve(output)), { recursive: true });
      await writeFile(resolve(output), `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
      console.log(`Reuse certificate: ${resolve(output)}`);
      console.log(`Reusable nodes: ${certificate.reusableNodeIds.length}`);
    }
    return audit.status === "sound" ? 0 : audit.status === "invalid" ? 2 : 3;
  }
  if (command === "verify") {
    if (!first || first.startsWith("--")) throw new Error("verify requires a certificate path.");
    const certificate = (await readJson(first)) as LeaseCertificate;
    const leasePath = option(args, "--lease");
    const document = leasePath ? await readJson(leasePath) : undefined;
    const result = verifyReuseCertificate({ certificate, document });
    outputJson(result);
    return result.valid ? 0 : 2;
  }
  if (command === "diff") {
    if (!first || !second || second.startsWith("--")) throw new Error("diff requires previous and next lease paths.");
    const diff = diffLeaseDocuments(await readJson(first), await readJson(second));
    if (args.includes("--json")) outputJson(diff);
    else console.log(formatDiff(diff));
    return diff.weakenedControls.length > 0 ? 4 : 0;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`AssumptionLease error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 5;
  });
