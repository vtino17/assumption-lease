import {
  auditLeases,
  buildRenewalPlan,
  compileReuseCertificate,
  createDriftedLease,
  createSoundLease,
} from "@assumptionlease/core";
import type {
  AssumptionAudit,
  LeaseAudit,
  LeaseDocument,
} from "@assumptionlease/core";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Application root was not found.");
const app: HTMLDivElement = root;
const fresh = (drifted = false): LeaseDocument =>
  drifted ? createDriftedLease(new Date()) : createSoundLease(new Date());

let documentValue = fresh();
let audit: LeaseAudit = auditLeases(documentValue);
let selected = audit.assumptions[0]!.assumptionId;

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
const duration = (minutes: number): string =>
  minutes < 0 ? `${Math.abs(minutes)}m overdue` : minutes < 120 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;

function assumptionCard(entry: AssumptionAudit): string {
  const item = documentValue.assumptions.find((candidate) => candidate.id === entry.assumptionId)!;
  return `<button class="lease ${entry.valid ? "valid" : "invalid"} ${entry.assumptionId === selected ? "selected" : ""}" data-assumption="${escape(entry.assumptionId)}">
    <span class="lease-dot"></span>
    <span><b>${escape(entry.assumptionId)}</b><small>${escape(item.statement)}</small></span>
    <span class="lease-time">${duration(entry.remainingMinutes)}<small>${entry.status}</small></span>
  </button>`;
}

function render(): void {
  const current = audit.assumptions.find((entry) => entry.assumptionId === selected) ?? audit.assumptions[0]!;
  const assumption = documentValue.assumptions.find((entry) => entry.id === current.assumptionId)!;
  const renewal = buildRenewalPlan(documentValue, audit).items.find((entry) => entry.assumptionId === current.assumptionId);
  const impacted = audit.impacts.filter((entry) => entry.invalidatedBy.includes(current.assumptionId));
  app.innerHTML = `
    <header>
      <a class="brand" href="#"><span>AL</span><b>AssumptionLease</b></a>
      <div class="header-state"><i></i> lease monitor online</div>
      <a class="github" href="https://github.com/vtino17/assumption-lease">GitHub ↗</a>
    </header>
    <main>
      <section class="hero">
        <div><p class="eyebrow">Long-running agents need expiring premises</p><h1>Plans age.<br><em>Assumptions should too.</em></h1></div>
        <div class="hero-note"><span>THE RULE</span><p>Never reuse an old decision until every assumption beneath it is still observed, valid, and inside its lease.</p></div>
      </section>
      <section class="overview">
        <article class="health health-${audit.status}"><small>Lease health</small><strong>${audit.status}</strong><span>${audit.validAssumptions}/${audit.assumptions.length} assumptions valid</span></article>
        <article><small>Reusable graph</small><strong>${audit.reusableNodes}/${audit.impacts.length}</strong><span>nodes safe to continue</span></article>
        <article><small>Invalidated</small><strong>${audit.invalidatedNodes}</strong><span>transitive dependents</span></article>
        <article><small>Renewal queue</small><strong>${audit.invalidAssumptions}</strong><span>probes required now</span></article>
      </section>
      <section class="graph-panel">
        <div class="panel-heading"><div><span>01</span><h2>Dependency impact map</h2></div><p>assumptions → plans → tasks → decisions</p></div>
        <div class="graph">
          <div class="graph-column"><label>ASSUMPTIONS</label>${audit.assumptions.map((entry) => `<button data-assumption="${escape(entry.assumptionId)}" class="graph-node ${entry.valid ? "safe" : "broken"}">${entry.valid ? "●" : "×"} ${escape(entry.assumptionId)}</button>`).join("")}</div>
          <div class="arrows">⟶<br>⟶<br>⟶</div>
          <div class="graph-column"><label>DEPENDENT WORK</label>${audit.impacts.map((entry) => {
            const node = documentValue.nodes.find((candidate) => candidate.id === entry.nodeId)!;
            return `<div class="graph-node ${entry.reusable ? "safe" : "broken"}"><span>${escape(node.kind)}</span>${escape(node.label)}<small>${entry.reusable ? "reusable" : `${entry.invalidatedBy.length} broken premise(s)`}</small></div>`;
          }).join("")}</div>
        </div>
      </section>
      <section class="workbench">
        <div class="editor-panel">
          <div class="panel-heading"><div><span>02</span><h2>Lease document</h2></div><div class="demo-buttons"><button id="sound">Sound demo</button><button id="drift">Drift demo</button></div></div>
          <textarea id="editor" spellcheck="false">${escape(JSON.stringify(documentValue, null, 2))}</textarea>
          <div id="error" class="error"></div>
          <div class="editor-footer"><span>JSON · schema 1.0</span><button id="audit">Audit leases <b>⌘↵</b></button></div>
        </div>
        <div class="inspector">
          <div class="panel-heading"><div><span>03</span><h2>Assumption inspector</h2></div><span class="status-tag ${current.valid ? "valid" : "invalid"}">${current.status}</span></div>
          <div class="lease-list">${audit.assumptions.map(assumptionCard).join("")}</div>
          <div class="detail">
            <p class="eyebrow">Selected premise</p>
            <h3>${escape(assumption.statement)}</h3>
            <div class="predicate"><span>${escape(assumption.predicate.path)}</span><b>${escape(assumption.predicate.operator)}</b><code>${escape(JSON.stringify(assumption.predicate.expected))}</code></div>
            <div class="detail-grid">
              <div><small>CRITICALITY</small><b>${assumption.criticality}</b></div>
              <div><small>OWNER</small><b>${escape(assumption.owner)}</b></div>
              <div><small>TIME LEFT</small><b>${duration(current.remainingMinutes)}</b></div>
              <div><small>IMPACT</small><b>${impacted.length} node(s)</b></div>
            </div>
            <div class="issues">${current.issues.length === 0
              ? `<div class="clear"><b>Lease is current</b><span>Latest observation satisfies the predicate.</span></div>`
              : current.issues.map((entry) => `<div class="issue"><span>${entry.severity}</span><p><b>${escape(entry.code)}</b>${escape(entry.message)}</p></div>`).join("")}</div>
            ${renewal ? `<div class="renewal"><small>RENEWAL PROBE · ${renewal.probe.kind}</small><p>${escape(renewal.probe.description)}</p><code>${escape(renewal.probe.target)}</code></div>` : ""}
          </div>
          <div class="certificate"><button id="download" ${audit.reusableNodes === 0 ? "disabled" : ""}>Download reuse certificate</button><span>certifies only unaffected nodes</span></div>
        </div>
      </section>
    </main>
    <footer><span>AssumptionLease v0.1</span><span>Deterministic · local-only · no model calls</span></footer>
  `;
  bind();
}

function runAudit(): void {
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  const error = document.querySelector<HTMLDivElement>("#error")!;
  try {
    documentValue = JSON.parse(editor.value) as LeaseDocument;
    audit = auditLeases(documentValue);
    if (!audit.assumptions.some((entry) => entry.assumptionId === selected)) selected = audit.assumptions[0]!.assumptionId;
    render();
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
  }
}

function load(drifted: boolean): void {
  documentValue = fresh(drifted);
  audit = auditLeases(documentValue);
  selected = audit.assumptions[0]!.assumptionId;
  render();
}

function download(): void {
  const certificate = compileReuseCertificate({ document: documentValue, audit });
  const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${documentValue.id}.reuse.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bind(): void {
  document.querySelector("#audit")?.addEventListener("click", runAudit);
  document.querySelector("#sound")?.addEventListener("click", () => load(false));
  document.querySelector("#drift")?.addEventListener("click", () => load(true));
  document.querySelector("#download")?.addEventListener("click", download);
  document.querySelectorAll<HTMLButtonElement>("[data-assumption]").forEach((button) =>
    button.addEventListener("click", () => {
      selected = button.dataset.assumption!;
      render();
    })
  );
  document.querySelector("#editor")?.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runAudit();
    }
  });
}

render();
