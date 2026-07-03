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
 * Trailing-aggregate-row guard, shared by the CSV and Excel setup paths.
 * Excel exports routinely end with blank + GESAMT/Summen rows; pandas reads
 * them as data, which EXACTLY DOUBLES every column sum (proven with a real
 * user file: 295.167,57 statt 147.583,79) and leaks phantom groupby keys
 * ("GESAMT:" as a Verkäufer). A trailing row is only removed when a numeric
 * cell equals the sum (or, for labelled/gappy rows, the mean) of ALL other
 * rows — a mathematically unambiguous signal — and the removal is printed so
 * the model and the user see it in the compute card.
 */
const CLEAN_HELPER = `import re as _gruen_re

_GRUEN_AGG_LABEL = _gruen_re.compile(r'^\\s*(gesamt|gesamtsumme|summe|total|insgesamt|mittelwert|durchschnitt)\\b', _gruen_re.I)

def _gruen_is_agg_row(_row, _head, _num, _txt):
    _label = any(isinstance(_row[_c], str) and _GRUEN_AGG_LABEL.match(_row[_c]) for _c in _txt)
    _gap = _label or (bool(_txt) and bool(_row[_txt].isna().any()))
    for _c in _num:
        _v = _row[_c]
        if pd.isna(_v):
            continue
        _tol = max(0.01, abs(float(_v)) * 1e-9)
        _s = _head[_c].sum()
        if (_gap or not _txt) and _s != 0 and abs(float(_v) - float(_s)) <= _tol:
            return True
        if _gap:
            _m = _head[_c].mean()
            if pd.notna(_m) and abs(float(_v) - float(_m)) <= _tol:
                return True
    return False

def _gruen_clean(_df):
    _df = _df.dropna(how='all')
    _num = list(_df.select_dtypes('number').columns)
    _txt = [_c for _c in _df.columns if _c not in _num]
    _removed = 0
    _changed = bool(_num)
    while _changed:
        _changed = False
        for _k in (3, 2, 1):
            if len(_df) - _k < 3:
                continue
            _head = _df.iloc[:-_k]
            _tail = _df.iloc[-_k:]
            if all(_gruen_is_agg_row(_tail.iloc[_i], _head, _num, _txt) for _i in range(_k)):
                _df = _head
                _removed += _k
                _changed = True
                break
    if _removed:
        print("Hinweis: " + str(_removed) + " Summen-/Gesamtzeile(n) am Tabellenende erkannt und für Berechnungen entfernt.")
    return _df.reset_index(drop=True)
`;

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
 * Both paths finish with the trailing-aggregate-row guard (CLEAN_HELPER).
 */
export function buildFileSetup(name: string, mimeType: string): string {
  const literal = JSON.stringify(name);
  if (isXlsx(name, mimeType) || isXls(name, mimeType)) {
    // pandas auto-selects openpyxl (.xlsx) or xlrd (.xls) by extension.
    // Multi-sheet workbooks (OpenWebUI/LobeHub parity): every sheet is loaded
    // and cleaned, `df` stays the FIRST sheet (backward compatible), and the
    // sheet map is announced via print — that line lands in the compute card
    // AND the respond context, so model and user know what is addressable.
    return `import pandas as pd
${CLEAN_HELPER}
_gruen_all = pd.read_excel(${literal}, sheet_name=None)
sheets = {}
for _gruen_n in _gruen_all:
    sheets[_gruen_n] = _gruen_clean(_gruen_all[_gruen_n])
df = sheets[next(iter(sheets))]
if len(sheets) > 1:
    print("Hinweis: Arbeitsmappe mit " + str(len(sheets)) + " Blättern: " + ", ".join(sheets) + ". df ist das Blatt '" + next(iter(sheets)) + "', weitere Blätter über sheets['Blattname'].")`;
  }
  return `import pandas as pd
import re as _re
${CLEAN_HELPER}

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

df = _gruen_clean(_gruen_load_csv(${literal}))`;
}
