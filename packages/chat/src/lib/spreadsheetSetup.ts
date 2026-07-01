/**
 * Pure helpers that turn an uploaded tabular file into the pandas setup snippet
 * the Pyodide worker runs before user code, plus the classifiers the worker and
 * the composer attachment bridge share.
 *
 * Dependency-free (like pyodidePackages.ts) so the worker can import it via the
 * `./pyodide` export without pulling the chat store/component graph. Takes plain
 * name/mimeType primitives rather than a PythonFile so it stays type-free.
 */

/** Modern Excel — pandas reads it via the (lazily installed) openpyxl engine.
 *  `spreadsheetml.sheet` is the .xlsx MIME. */
export function isXlsx(name: string, mimeType: string): boolean {
  return name.toLowerCase().endsWith('.xlsx') || mimeType.includes('spreadsheetml.sheet');
}

/** Legacy .xls — pandas reads it via the (lazily installed) xlrd engine.
 *  `ms-excel` is the .xls MIME. (.ods is intentionally unsupported: odfpy ships
 *  no wheel, so it can't be micropip-installed offline — .ods files fall back to
 *  normal document text extraction instead of the pandas interpreter.) */
export function isXls(name: string, mimeType: string): boolean {
  return name.toLowerCase().endsWith('.xls') || mimeType.includes('ms-excel');
}

/** CSV / .xlsx / .xls — the set the composer captures into the interpreter's
 *  session store so the Run button can hand the bytes to the worker. */
export function isTabularFile(name: string, mimeType: string): boolean {
  return (
    mimeType === 'text/csv' ||
    name.toLowerCase().endsWith('.csv') ||
    isXlsx(name, mimeType) ||
    isXls(name, mimeType)
  );
}

/**
 * Python that loads the file into a pandas DataFrame `df` before user code runs.
 * CSVs vary wildly (German `;`-separated, odd encodings) — let pandas sniff the
 * separator; .xlsx→openpyxl, .xls→xlrd (engines installed on demand by the
 * worker).
 */
export function buildFileSetup(name: string, mimeType: string): string {
  const literal = JSON.stringify(name);
  if (isXlsx(name, mimeType) || isXls(name, mimeType)) {
    // pandas auto-selects openpyxl (.xlsx) or xlrd (.xls) by extension.
    return `import pandas as pd\ndf = pd.read_excel(${literal})`;
  }
  return `import pandas as pd\ndf = pd.read_csv(${literal}, sep=None, engine='python')`;
}
