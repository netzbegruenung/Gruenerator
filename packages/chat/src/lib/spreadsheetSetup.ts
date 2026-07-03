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
 * CSVs vary wildly — German Excel exports in particular: `;`-separated,
 * cp1252-encoded (umlauts!) and with decimal commas ("1.234,56"). The loader
 * sniffs the separator, falls back through encodings, and converts columns
 * that consistently look like German-formatted numbers to floats (only
 * object-dtype columns with at least one comma qualify, so English decimals —
 * already parsed as float64 — are never touched).
 * .xlsx→openpyxl, .xls→xlrd (engines installed on demand by the worker);
 * Excel stores real numbers, so only CSV needs the number normalization.
 */
export function buildFileSetup(name: string, mimeType: string): string {
  const literal = JSON.stringify(name);
  if (isXlsx(name, mimeType) || isXls(name, mimeType)) {
    // pandas auto-selects openpyxl (.xlsx) or xlrd (.xls) by extension.
    return `import pandas as pd\ndf = pd.read_excel(${literal})`;
  }
  return `import pandas as pd
import re as _re

def _gruen_load_csv(_path):
    _df = None
    for _enc in ('utf-8-sig', 'cp1252'):
        try:
            _df = pd.read_csv(_path, sep=None, engine='python', encoding=_enc)
            break
        except UnicodeDecodeError:
            continue
    if _df is None:
        _df = pd.read_csv(_path, sep=None, engine='python', encoding='utf-8', encoding_errors='replace')
    _german = _re.compile(r'^\\s*-?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d+)?\\s*$')
    for _col in _df.columns:
        if _df[_col].dtype != object:
            continue
        _vals = _df[_col].dropna().astype(str)
        if len(_vals) and _vals.str.contains(',').any() and _vals.str.match(_german).all():
            _df[_col] = pd.to_numeric(
                _df[_col].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False),
                errors='coerce',
            )
    return _df

df = _gruen_load_csv(${literal})`;
}
