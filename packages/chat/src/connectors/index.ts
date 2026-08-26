// Connector branding, shared with the Konnektoren settings page in apps/web.
//
// The vendor-logo registry used to exist twice — once here for the composer
// chip, once in `apps/web/.../McpSection.tsx` — and the copies drifted to 13 and
// 15 entries with 10 in common, so a service drew its logo on one surface and a
// generic plug on the other. `../lib/connectorBrand` is now the only list; this
// entry lets the settings page reach it without importing the package barrel,
// which would pull the whole assistant-ui component graph onto that page.
//
// Lives at `src/connectors/` so both the Vite source alias
// (@gruenerator/chat/* → src/*) and the package `exports` map resolve it —
// same rule as `src/pyodide/`.
// `legibleBrandColor` stays out on purpose: it is measured against the composer
// chip's ground, and the settings page draws its logos white on a brand-coloured
// tile. Exporting it here would invite a caller onto numbers that do not apply.
export { connectorBrandIcon } from '../lib/connectorBrand';
