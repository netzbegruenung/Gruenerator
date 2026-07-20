// Lean, dependency-free entry for the Pyodide worker (apps/web) — re-exports the
// pure package-detection helper without pulling the chat store/component graph.
// Lives at `src/pyodide/` so both the Vite source alias (@gruenerator/chat/* →
// src/*) and the package `exports` map resolve it.
export { detectPyodidePackages } from '../lib/pyodidePackages';
export { buildFileSetup, isXlsx, isXls } from '../lib/spreadsheetSetup';
export { sanitizePythonCode } from '../lib/pythonCodeSanitizer';
export { runPythonCore, ENGINE_WHEEL_FILES, type PyRuntime } from './runCore';
