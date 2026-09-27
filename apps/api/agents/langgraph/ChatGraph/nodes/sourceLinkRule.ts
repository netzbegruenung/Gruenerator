import { SOURCE_LINK_SCHEME } from '@gruenerator/shared/utils';

/**
 * Titles become links to the numbered source — `[Titel](quelle:N)`, see
 * `@gruenerator/shared/utils` sourceLinks. The model never sees a URL for a
 * source, so without this rule it can only write the bare title plus a
 * citation bubble; with it the renderer opens the document itself. Shared by
 * the single-pass citation block and the loop's citation rules, so both paths
 * write the same form.
 */
export const SOURCE_LINK_RULE = `Nennst du ein Dokument aus den Quellen beim Titel — etwa in einer Aufzählung von Quellen oder wenn nach Titeln, Dokumenten oder Links gefragt wird —, dann verlinke den Titel mit seiner Quellennummer: [Titel](${SOURCE_LINK_SCHEME}:N). Das ist der Link zum Dokument, setze dahinter kein zusätzliches [N]. Schreibe für diese Quellen nie selbst eine URL.`;
