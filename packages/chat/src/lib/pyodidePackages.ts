/**
 * Map a Python snippet's top-level imports to the Pyodide packages that must be
 * `loadPackage()`-ed before it runs. Only these are fetched per execution (their
 * transitive deps are resolved by Pyodide), so a plain `len(...)` snippet pays
 * for nothing and pandas/scipy/etc. load only when actually imported.
 *
 * Pure + dependency-free so the Pyodide worker can import it without pulling the
 * chat package's store graph (see the `./pyodide` export). Mirrors open-webui's
 * import-detection approach.
 */

// Python import module → Pyodide package name. Only modules NOT in the Python
// stdlib need a wheel; `re`, `json`, `math`, `statistics`, etc. are stdlib.
const MODULE_TO_PACKAGE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnumpy\b/, 'numpy'],
  [/\bpandas\b/, 'pandas'],
  [/\bmatplotlib\b/, 'matplotlib'],
  [/\bscipy\b/, 'scipy'],
  [/\bsklearn\b/, 'scikit-learn'],
  [/\bsympy\b/, 'sympy'],
  [/\bseaborn\b/, 'seaborn'],
  [/\bopenpyxl\b/, 'openpyxl'],
  [/\brequests\b/, 'requests'],
  [/\bbs4\b/, 'beautifulsoup4'],
  [/\bregex\b/, 'regex'],
];

/**
 * Return the Pyodide package names imported by `code` (deduped, order-stable).
 * Matches `import X`, `import X as Y`, `from X import ...`, and dotted forms
 * like `import matplotlib.pyplot`.
 */
export function detectPyodidePackages(code: string): string[] {
  // Collect the module roots from import statements only (avoids matching the
  // module name inside an unrelated identifier or string).
  const importedRoots = new Set<string>();
  const importRe = /^[ \t]*(?:from|import)[ \t]+([\w.]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(code)) !== null) {
    importedRoots.add(m[1].split('.')[0]);
  }
  if (importedRoots.size === 0) return [];

  const rootsText = ` ${[...importedRoots].join(' ')} `;
  const packages: string[] = [];
  for (const [re, pkg] of MODULE_TO_PACKAGE) {
    if (re.test(rootsText) && !packages.includes(pkg)) packages.push(pkg);
  }
  return packages;
}
