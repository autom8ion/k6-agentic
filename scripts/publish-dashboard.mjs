#!/usr/bin/env node
// Assembles the GitHub Pages content for one CI run: copies each protocol's
// k6 web-dashboard HTML export + summary JSON into _site/runs/<runId>/,
// then regenerates the root index.html and data/runs.json manifest (the
// latter is what a Grafana JSON API / Infinity datasource would point at
// for trend panels -- see README.md "Publishing dashboards to GitHub Pages").
//
// Expects dashboard-artifacts/<protocol>-{dashboard.html,summary.json} for
// whichever protocols succeeded, and _site/ pre-seeded with the current
// gh-pages branch content (run history + prior manifest), if any.

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACT_DIR = 'dashboard-artifacts';
const SITE_DIR = '_site';
const MAX_RUNS = 50;

const PROTOCOLS = [
  {
    key: 'rest',
    label: 'REST (QuickPizza)',
    durationMetric: 'rest_req_duration',
    errorMetric: 'rest_error_rate',
    countMetric: 'rest_requests_total',
  },
  {
    key: 'graphql',
    label: 'GraphQL (Countries)',
    durationMetric: 'graphql_req_duration',
    errorMetric: 'graphql_error_rate',
    countMetric: 'graphql_requests_total',
  },
  {
    key: 'db',
    label: 'Postgres (xk6-sql)',
    durationMetric: 'db_query_duration',
    errorMetric: 'db_error_rate',
    countMetric: 'db_queries_total',
  },
];

// k6's --summary-export marks each threshold with whether it was breached
// (true = failed); absence of any breach across every metric means the run
// passed its declared SLOs.
function thresholdsPassed(summary) {
  for (const metric of Object.values(summary.metrics ?? {})) {
    for (const breached of Object.values(metric.thresholds ?? {})) {
      if (breached) return false;
    }
  }
  return true;
}

function extractProtocol(proto) {
  const summaryPath = join(ARTIFACT_DIR, `${proto.key}-summary.json`);
  const dashboardPath = join(ARTIFACT_DIR, `${proto.key}-dashboard.html`);
  if (!existsSync(summaryPath) || !existsSync(dashboardPath)) return null;

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const metrics = summary.metrics ?? {};
  const duration = metrics[proto.durationMetric] ?? {};
  const error = metrics[proto.errorMetric] ?? {};
  const count = metrics[proto.countMetric] ?? {};

  return {
    key: proto.key,
    label: proto.label,
    passed: thresholdsPassed(summary),
    p95Ms: typeof duration['p(95)'] === 'number' ? Math.round(duration['p(95)'] * 100) / 100 : null,
    errorRatePct: typeof error.value === 'number' ? Math.round(error.value * 10000) / 100 : null,
    requests: typeof count.count === 'number' ? count.count : null,
  };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function badge(passed) {
  const color = passed ? '#1a7f37' : '#cf222e';
  const label = passed ? 'pass' : 'fail';
  return `<span style="color:${color};font-weight:600">${label}</span>`;
}

function renderRunPage({ runId, sha, ref, timestamp, commitUrl, results }) {
  const rows = results
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${badge(r.passed)}</td>
        <td>${r.p95Ms ?? '—'} ms</td>
        <td>${r.errorRatePct ?? '—'}%</td>
        <td>${r.requests ?? '—'}</td>
        <td><a href="${r.key}-dashboard.html">HTML dashboard</a> · <a href="${r.key}-summary.json">summary.json</a></td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>k6 run ${escapeHtml(runId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2328; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #d0d7de; }
  a { color: #0969da; }
</style>
</head>
<body>
  <p><a href="../../index.html">&larr; all runs</a></p>
  <h1>k6 run ${escapeHtml(runId)}</h1>
  <p>ref: <code>${escapeHtml(ref)}</code> · commit: <a href="${commitUrl}"><code>${escapeHtml(sha.slice(0, 7))}</code></a> · ${escapeHtml(timestamp)}</p>
  <table>
    <thead><tr><th>Protocol</th><th>Thresholds</th><th>p95 duration</th><th>Error rate</th><th>Requests</th><th>Reports</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

function renderIndexPage(history) {
  const rows = history
    .map((run) => {
      const protoCells = run.protocols
        .map((r) => `${escapeHtml(r.label)} ${badge(r.passed)}`)
        .join(' &nbsp;·&nbsp; ');
      return `
      <tr>
        <td><a href="runs/${run.runId}/index.html">${escapeHtml(run.runId)}</a></td>
        <td>${escapeHtml(run.timestamp)}</td>
        <td><a href="${run.commitUrl}"><code>${escapeHtml(run.sha.slice(0, 7))}</code></a></td>
        <td>${protoCells}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>k6-agentic performance dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2328; max-width: 960px; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #d0d7de; }
  a { color: #0969da; }
  code { background: #f6f8fa; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
</head>
<body>
  <h1>k6-agentic performance dashboard</h1>
  <p>Published by the <code>Performance Dashboard</code> GitHub Actions workflow on every push to <code>main</code>.
     Each run's k6 web-dashboard HTML export and <code>--summary-export</code> JSON are kept under
     <code>runs/&lt;runId&gt;/</code>. The full history below is also available as JSON at
     <a href="data/runs.json"><code>data/runs.json</code></a> for a Grafana JSON API / Infinity datasource
     to chart trends across runs -- see README.md "Publishing dashboards to GitHub Pages".</p>
  <table>
    <thead><tr><th>Run</th><th>Published</th><th>Commit</th><th>Protocols</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

const runId = `${process.env.GITHUB_RUN_NUMBER ?? 'local'}-${(process.env.GITHUB_SHA ?? 'unknown').slice(0, 7)}`;
const sha = process.env.GITHUB_SHA ?? 'unknown';
const ref = process.env.GITHUB_REF_NAME ?? 'unknown';
const repo = process.env.GITHUB_REPOSITORY ?? '';
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const timestamp = new Date().toISOString();
const commitUrl = `${serverUrl}/${repo}/commit/${sha}`;

const runDir = join(SITE_DIR, 'runs', runId);
mkdirSync(runDir, { recursive: true });

const results = [];
for (const proto of PROTOCOLS) {
  const extracted = extractProtocol(proto);
  if (!extracted) continue;
  cpSync(
    join(ARTIFACT_DIR, `${proto.key}-dashboard.html`),
    join(runDir, `${proto.key}-dashboard.html`),
  );
  cpSync(
    join(ARTIFACT_DIR, `${proto.key}-summary.json`),
    join(runDir, `${proto.key}-summary.json`),
  );
  results.push(extracted);
}

if (results.length === 0) {
  console.error('No protocol results found in dashboard-artifacts/ -- nothing to publish.');
  process.exit(1);
}

writeFileSync(
  join(runDir, 'index.html'),
  renderRunPage({ runId, sha, ref, timestamp, commitUrl, results }),
);

const manifestPath = join(SITE_DIR, 'data', 'runs.json');
mkdirSync(join(SITE_DIR, 'data'), { recursive: true });
let history = [];
if (existsSync(manifestPath)) {
  try {
    history = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    history = [];
  }
}
history = history.filter((r) => r.runId !== runId);
history.unshift({ runId, sha, ref, timestamp, commitUrl, protocols: results });
history = history.slice(0, MAX_RUNS);
writeFileSync(manifestPath, JSON.stringify(history, null, 2));

writeFileSync(join(SITE_DIR, 'index.html'), renderIndexPage(history));

console.log(
  `Published run ${runId} (${results.map((r) => r.key).join(', ')}) -- ${history.length} runs retained.`,
);
