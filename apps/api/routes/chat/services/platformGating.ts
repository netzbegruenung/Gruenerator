/**
 * Fixed redirects for chat features the mobile app can't render. The gates
 * live in chatGraphContractRouter (sharepic/social_post) and reelEditService
 * (reel edit); the matching model-facing feature list is the PLATTFORMKONTEXT
 * block in respondNode — keep all three in sync when a feature ships on the
 * app.
 */
export const APP_REDIRECT_TEXTS = {
  sharepic:
    'Sharepics kannst du aktuell nur in der Web-Version von Grünerator erstellen. ' +
    'Öffne dafür gruenerator.eu im Browser.',
  reelEdit:
    'Reel-Untertitel kannst du aktuell nur in der Web-Version von Grünerator bearbeiten. ' +
    'Öffne dafür gruenerator.eu im Browser.',
} as const;
