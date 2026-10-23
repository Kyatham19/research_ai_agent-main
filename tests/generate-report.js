// Reads TEST-REPORT.json (Playwright JSON reporter output) and writes TEST-REPORT.md.
// Run after: npm test
// Usage: node generate-report.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORT_JSON = path.join(__dirname, 'TEST-REPORT.json');
const REPORT_MD = path.join(__dirname, 'TEST-REPORT.md');

if (!fs.existsSync(REPORT_JSON)) {
  console.error('TEST-REPORT.json not found. Run npm test first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8'));

const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
const nodeVer = process.version;
const pwPkg = require('./node_modules/@playwright/test/package.json');
const pwVer = pwPkg.version;
const platform = `${os.type()} ${os.release()}`;

let totalPass = 0, totalFail = 0, totalSkip = 0, totalFlaky = 0;

// Flatten suites into test results
function flattenTests(suites, specFile = '') {
  const results = [];
  for (const suite of (suites || [])) {
    const file = suite.file || specFile;
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        const status = test.results?.[0]?.status || 'unknown';
        const duration = test.results?.[0]?.duration || 0;
        results.push({
          file: file.replace(/.*[/\\]e2e[/\\]/, ''),
          title: spec.title,
          fullTitle: [...(spec.titlePath || [spec.title])].join(' › '),
          status,
          duration,
          error: test.results?.[0]?.error?.message || '',
        });
      }
    }
    // Recurse into nested suites
    results.push(...flattenTests(suite.suites || [], file));
  }
  return results;
}

const tests = flattenTests(report.suites || []);

// Group by file
const byFile = {};
for (const t of tests) {
  if (!byFile[t.file]) byFile[t.file] = [];
  byFile[t.file].push(t);
}

// Count totals
for (const t of tests) {
  if (t.status === 'passed') totalPass++;
  else if (t.status === 'failed' || t.status === 'timedOut') totalFail++;
  else if (t.status === 'skipped') totalSkip++;
  else if (t.status === 'flaky') totalFlaky++;
}

const totalTests = tests.length;
const passRate = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 0;

let md = `# Test Report — Research AI Agent\n\n`;
md += `**Generated:** ${now}  \n`;
md += `**Node:** ${nodeVer}  \n`;
md += `**Playwright:** v${pwVer}  \n`;
md += `**Platform:** ${platform}  \n\n`;

md += `---\n\n## Summary\n\n`;
md += `| Metric | Count |\n|--------|-------|\n`;
md += `| Total Tests | ${totalTests} |\n`;
md += `| ✅ Passed | ${totalPass} |\n`;
md += `| ❌ Failed | ${totalFail} |\n`;
md += `| ⏭ Skipped | ${totalSkip} |\n`;
if (totalFlaky > 0) md += `| ⚠ Flaky | ${totalFlaky} |\n`;
md += `| **Pass Rate** | **${passRate}%** |\n\n`;

if (totalFail === 0) {
  md += `> ✅ All tests passed.\n\n`;
} else {
  md += `> ❌ ${totalFail} test(s) failed. See details below.\n\n`;
}

md += `---\n\n## Results by Spec File\n\n`;

for (const [file, fileTests] of Object.entries(byFile)) {
  const fp = fileTests.filter(t => t.status === 'passed').length;
  const ff = fileTests.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
  const fs_ = fileTests.filter(t => t.status === 'skipped').length;
  const icon = ff > 0 ? '❌' : '✅';
  md += `### ${icon} ${file}\n\n`;
  md += `Passed: ${fp} / ${fileTests.length}${ff > 0 ? ` — **${ff} FAILED**` : ''}${fs_ > 0 ? ` — ${fs_} skipped` : ''}\n\n`;
  md += `| Test | Status | Duration |\n|------|--------|----------|\n`;
  for (const t of fileTests) {
    const statusIcon = t.status === 'passed' ? '✅' : t.status === 'skipped' ? '⏭' : '❌';
    const dur = t.duration > 0 ? `${(t.duration / 1000).toFixed(2)}s` : '—';
    md += `| ${t.fullTitle} | ${statusIcon} ${t.status} | ${dur} |\n`;
  }
  md += '\n';
}

// Failure details
const failures = tests.filter(t => t.status === 'failed' || t.status === 'timedOut');
if (failures.length > 0) {
  md += `---\n\n## Failure Details\n\n`;
  for (const t of failures) {
    md += `### ❌ ${t.fullTitle}\n\n`;
    md += `**File:** ${t.file}  \n`;
    md += `**Duration:** ${(t.duration / 1000).toFixed(2)}s  \n`;
    if (t.error) {
      md += `\`\`\`\n${t.error.substring(0, 800)}\n\`\`\`\n`;
    }
    md += '\n';
  }
}

md += `---\n\n## How to Re-Run\n\n`;
md += `\`\`\`bash\n# Run all mocked tests (fast)\ncd tests && npm test\n\n`;
md += `# Run integration tests (requires backend + GEMINI_API_KEY)\nnpm run test:integration\n\n`;
md += `# Open Playwright HTML report\nnpm run show-report\n\`\`\`\n`;

fs.writeFileSync(REPORT_MD, md, 'utf8');
console.log(`Written: ${REPORT_MD}`);
console.log(`Total: ${totalTests} | Passed: ${totalPass} | Failed: ${totalFail} | Skipped: ${totalSkip}`);
