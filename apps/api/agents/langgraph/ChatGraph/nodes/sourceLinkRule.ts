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

/**
 * The counterpart for agents with `inlineSourceLinks` (Bürger*innenanfragen,
 * LV source agents): their answer is a ready-to-send email that is copied out
 * of the app, where `(quelle:N)` is a dead link (#5615). They link the source's
 * real URL instead — the one the source block carries (`Quelle-URL:` on the
 * single-pass path, `<url>` on the loop's source lines). Forbidding invented
 * addresses stays: a source without a URL gets its title, not a guess.
 */
export const INLINE_SOURCE_URL_RULE = `Nennst du ein Dokument aus den Quellen beim Titel oder verweist auf es, dann verlinke den Titel mit der URL, die bei dieser Quelle steht: [Titel](https://…). Der Text wird aus der App heraus verschickt — schreibe deshalb NIE [Titel](${SOURCE_LINK_SCHEME}:N). Nutze ausschließlich URLs, die bei den Quellen stehen; erfinde oder kürze keine. Steht bei einer Quelle keine URL, nenne nur ihren Titel ohne Link.`;

/** The link rule for this agent: inline URLs or the `quelle:N` reader link. */
export function sourceLinkRule(inlineSourceLinks: boolean | undefined): string {
  return inlineSourceLinks ? INLINE_SOURCE_URL_RULE : SOURCE_LINK_RULE;
}
