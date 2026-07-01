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

/** Legacy .xls (needs xlrd) and .ods (needs odfpy) — out of scope, rejected with
 *  a clear hint. `ms-excel` is the .xls MIME. */
export function isLegacySpreadsheet(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.xls') ||
    lower.endsWith('.ods') ||
    mimeType.includes('ms-excel') ||
    mimeType.includes('opendocument.spreadsheet')
  );
}

/** CSV or any spreadsheet — the set the composer captures into the interpreter's
 *  session store so the Run button can hand the bytes to the worker. */
export function isTabularFile(name: string, mimeType: string): boolean {
  return (
    mimeType === 'text/csv' ||
    name.toLowerCase().endsWith('.csv') ||
    isXlsx(name, mimeType) ||
    isLegacySpreadsheet(name, mimeType)
  );
}

/**
 * Python that loads the file into a pandas DataFrame `df` before user code runs.
 * CSVs vary wildly (German `;`-separated, odd encodings) — let pandas sniff the
 * separator; .xlsx goes through openpyxl; legacy formats raise a clear error.
 */
export function buildFileSetup(name: string, mimeType: string): string {
  const literal = JSON.stringify(name);
  if (isXlsx(name, mimeType)) {
    return `import pandas as pd\ndf = pd.read_excel(${literal})`;
  }
  if (isLegacySpreadsheet(name, mimeType)) {
    return `raise RuntimeError('Nur .xlsx wird unterstützt – bitte die Datei als .xlsx oder CSV exportieren.')`;
  }
  return `import pandas as pd\ndf = pd.read_csv(${literal}, sep=None, engine='python')`;
}
