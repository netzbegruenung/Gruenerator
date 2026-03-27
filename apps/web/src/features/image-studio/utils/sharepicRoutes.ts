/**
 * Maps sharepic type identifiers (both PascalCase legacy and lowercase URL forms)
 * to their corresponding Image Studio template routes.
 */
export const SHAREPIC_TYPE_ROUTE_MAP: Record<string, string> = {
  // Lowercase (URL-style) keys
  dreizeilen: '/studio/templates/dreizeilen',
  zitat: '/studio/templates/zitat',
  'zitat-pure': '/studio/templates/zitat-pure',
  info: '/studio/templates/info',
  headline: '/studio/templates/headline',
  // PascalCase (legacy metadata) keys
  Dreizeilen: '/studio/templates/dreizeilen',
  Zitat: '/studio/templates/zitat',
  Zitat_Pure: '/studio/templates/zitat-pure',
  Info: '/studio/templates/info',
  Headline: '/studio/templates/headline',
};

/**
 * Resolves a sharepic type string to an Image Studio route.
 * Accepts both PascalCase (from gallery metadata) and lowercase (from URL) forms.
 */
export function getSharepicRoute(sharepicType: string): string | null {
  return SHAREPIC_TYPE_ROUTE_MAP[sharepicType] ?? null;
}
