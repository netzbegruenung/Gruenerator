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

/**
 * An edit-shaped message ("Mach den Text größer") in a thread that has no
 * sharepic. Names the missing artifact AND teaches the word that creates one —
 * the turn otherwise ended either in silence or, worse, in a fresh sharepic
 * about the edit instruction itself.
 */
export const NO_SHAREPIC_TO_EDIT_TEXT =
  'In diesem Chat gibt es noch kein Sharepic, das ich anpassen könnte. ' +
  'Sag mir, worum es gehen soll — zum Beispiel „Mach ein Sharepic zum Radwegeausbau" — ' +
  'dann erstelle ich dir eins.';
