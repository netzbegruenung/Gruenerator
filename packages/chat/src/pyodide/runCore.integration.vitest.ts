/**
 * Real-runtime integration tests for the Python compute path: they load the
 * ACTUAL Pyodide runtime + the vendored wheels (apps/web/public/pyodide, the
 * exact artifacts the browser worker uses) in Node and drive the production
 * `runPythonCore` — sanitizer, package loading, spreadsheet engines, harness,
 * stdout parsing. This covers what previously needed a live beta session:
 * LLM-typography code, CSV/XLSX loading into `df`, groupby aggregations,
 * error handling and back-to-back runs.
 *
 * Opt-in (slow: ~30-90s cold start):
 *   pnpm --filter @gruenerator/chat test:pyodide
 * Requires the vendored dist (created by apps/web `pnpm setup:pyodide`, which
 * runs automatically on web dev/build) for the spreadsheet-engine wheels. The
 * Pyodide CORE loads from node_modules (the browser asm build in the vendored
 * dir can't run in Node); pandas & friends are fetched once from the pinned
 * Pyodide CDN and cached on disk for subsequent runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseComputeResult } from '../lib/computeResult';
import { ENGINE_WHEEL_FILES, runPythonCore, type PyRuntime } from './runCore';

import type { PythonFile } from '../stores/chatConfigStore';

const DIST = path.resolve(__dirname, '../../../../apps/web/public/pyodide');
const ENABLED = process.env.PYODIDE_TESTS === '1' && existsSync(DIST);

const c = (codePoint: number) => String.fromCharCode(codePoint);
const LOW_DQ = c(0x201e); // „ German low double quote (the beta failure)
const LDQ = c(0x201c); // “
const NBSP = c(0x00a0);
const NNBSP = c(0x202f);

function csvFile(name: string, content: string): PythonFile {
  const bytes = new TextEncoder().encode(content);
  // Standalone ArrayBuffer (not a shared view) — mirrors the store's shape.
  return { name, mimeType: 'text/csv', bytes: bytes.buffer.slice(0, bytes.byteLength) };
}

const SALES_CSV = csvFile(
  'umsatz.csv',
  'Region;Umsatz;Gewinn\nNord;100.5;20.5\nNord;99.5;9.5\nSued;200.0;30.0\n'
);

describe.skipIf(!ENABLED)('runPythonCore against the real Pyodide runtime', () => {
  let py: PyRuntime;
  const opts = {
    // Engine wheels are staged into the pyodide FS in beforeAll; micropip
    // installs them via emfs: paths (Node can't fetch the browser's /pyodide/
    // URLs). The browser worker resolves the same file names to /pyodide/.
    resolveWheelUrl: (fileName: string) => `emfs:/wheels/${fileName}`,
  };

  beforeAll(async () => {
    const { loadPyodide } = await import('pyodide');
    py = (await loadPyodide({
      packageCacheDir: path.join(os.tmpdir(), 'gruenerator-pyodide-test-cache'),
    })) as unknown as PyRuntime;
    (py.FS as unknown as { mkdir(p: string): void }).mkdir('/wheels');
    for (const fileName of [...ENGINE_WHEEL_FILES.xlsx, ...ENGINE_WHEEL_FILES.xls]) {
      py.FS.writeFile(
        `/wheels/${fileName}`,
        new Uint8Array(readFileSync(path.join(DIST, fileName)))
      );
    }
  }, 240_000);

  it('loads a CSV into df and computes a labelled sum', async () => {
    const result = await runPythonCore(
      py,
      'print("Gesamtgewinn:", round(df["Gewinn"].sum(), 2))',
      [SALES_CSV],
      opts
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('Gesamtgewinn: 60.0');

    const compute = parseComputeResult('Tabellen-Berechnung', result.stdout);
    expect(compute.entries[0]).toEqual({ label: 'Gesamtgewinn', value: '60.0' });
  }, 120_000);

  it('sanitizes typographic quotes before execution (beta SyntaxError regression)', async () => {
    // GPT-OSS emitted German „…“ quotes → "unterminated string literal".
    const dirty = `print(${LOW_DQ}Gesamtgewinn:${LDQ}, df[${LOW_DQ}Gewinn${LDQ}].sum())`;
    const result = await runPythonCore(py, dirty, [SALES_CSV], opts);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('Gesamtgewinn: 60.0');
  }, 120_000);

  it('sanitizes NBSP / narrow NBSP whitespace (no-op-fix regression)', async () => {
    const dirty = `print("Summe:",${NBSP}df["Umsatz"].sum())${NNBSP}`;
    const result = await runPythonCore(py, dirty, [SALES_CSV], opts);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('Summe: 400.0');
  }, 120_000);

  it('computes a groupby aggregation with one labelled line per group', async () => {
    const code = [
      'means = df.groupby("Region")["Umsatz"].mean()',
      'for region, value in means.items():',
      '    print(f"{region}:", round(value, 2))',
    ].join('\n');
    const result = await runPythonCore(py, code, [SALES_CSV], opts);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('Nord: 100.0');
    expect(result.stdout).toContain('Sued: 200.0');

    const compute = parseComputeResult('Tabellen-Berechnung', result.stdout);
    expect(compute.entries).toHaveLength(2);
  }, 120_000);

  it('reads a real .xlsx via the micropip-installed openpyxl engine', async () => {
    // Fixture setup only: pre-install openpyxl so the runtime can GENERATE a
    // genuine xlsx. Reading it back below goes through runPythonCore's own
    // ensureSpreadsheetEngine path (micropip install from emfs wheels).
    await py.loadPackage(['micropip']);
    await py.runPythonAsync(
      `import micropip\nawait micropip.install([${ENGINE_WHEEL_FILES.xlsx
        .map((f) => `'emfs:/wheels/${f}'`)
        .join(',')}], deps=False)`
    );

    const genResult = await runPythonCore(
      py,
      [
        'import openpyxl',
        'wb = openpyxl.Workbook()',
        'ws = wb.active',
        'ws.append(["Produkt", "Gewinn"])',
        'ws.append(["A", 10])',
        'ws.append(["B", 32])',
        'wb.save("/gen.xlsx")',
        'with open("/gen.xlsx", "rb") as f:',
        '    import base64',
        '    print(base64.b64encode(f.read()).decode())',
      ].join('\n'),
      [],
      opts
    );
    expect(genResult.ok).toBe(true);

    const xlsxBytes = Uint8Array.from(atob(genResult.stdout.trim()), (ch) => ch.charCodeAt(0));
    const xlsxFile: PythonFile = {
      name: 'gewinne.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: xlsxBytes.buffer.slice(0, xlsxBytes.byteLength),
    };

    const result = await runPythonCore(
      py,
      'print("Gesamtgewinn:", int(df["Gewinn"].sum()))',
      [xlsxFile],
      opts
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('Gesamtgewinn: 42');
  }, 180_000);

  it('reports Python errors as ok:false and recovers on the next run', async () => {
    const broken = await runPythonCore(py, 'print(df["GibtEsNicht"].sum())', [SALES_CSV], opts);
    expect(broken.ok).toBe(false);
    expect(broken.error).toBeTruthy();

    // The follow-up run must succeed — runtime state stays usable and the
    // fresh namespace prevents leakage from the failed run.
    const next = await runPythonCore(py, 'print("Zeilen:", len(df))', [SALES_CSV], opts);
    expect(next.ok).toBe(true);
    expect(next.stdout).toContain('Zeilen: 3');
  }, 120_000);

  it('keeps input file bytes intact across back-to-back runs (detach regression)', async () => {
    const file = csvFile('mehrfach.csv', 'A;B\n1;2\n3;4\n');
    const first = await runPythonCore(py, 'print("Summe:", int(df["A"].sum()))', [file], opts);
    const second = await runPythonCore(py, 'print("Summe:", int(df["B"].sum()))', [file], opts);
    expect(first.ok).toBe(true);
    expect(first.stdout).toContain('Summe: 4');
    expect(second.ok).toBe(true);
    expect(second.stdout).toContain('Summe: 6');
    expect(file.bytes.byteLength).toBeGreaterThan(0);
  }, 120_000);
});
