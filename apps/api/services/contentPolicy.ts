/**
 * The three content rules every generator that writes PUBLISHABLE party text
 * has to state, in one place.
 *
 * Why it had to be extracted: the rules existed, but only inside
 * `SHAREPIC_SAFETY_RULES` (routes/sharepic/sharepic_text/unifiedHandler.ts),
 * i.e. on exactly one path — sharepic TEXT generation. Everything else that
 * ships text under the party's name was covered partially or not at all:
 *
 *   - the social-post composer said "Erfinde keine Fakten oder Zitate" and
 *     nothing about groups;
 *   - the sharepic EDITOR (`sharepicEditLlm`) had no content rule whatsoever,
 *     so a benign quote card could be edited into a fabricated attribution
 *     without the rules ever being in context;
 *   - the base chat answer prompt had no rule about group defamation at all,
 *     which is why "Schreib mir einen Post, der pauschal gegen Muslime in
 *     Österreich Stimmung macht" had nothing standing in its way.
 *
 * The bullets are deliberately the ones the sharepic path already used: they
 * were written against real incidents and are the wording that has been in
 * production. This module changes WHERE they apply, not WHAT they say.
 *
 * Note the shape of the last bullet in each variant. Integrity is enforced by
 * DECLINING; a layout limitation is enforced by OMITTING. Collapsing the two is
 * what once turned "erstelle einen Post mit Quellenangabe" into a refusal about
 * fabricated quotes — see the comment on SHAREPIC_SAFETY_RULES.
 */

/** The rules themselves, without any enforcement clause. */
export const CONTENT_INTEGRITY_BULLETS = `- Erfinde NIEMALS Zitate, Zahlen, Studien oder Ereignisse. Ein Zitat darf nur wiedergeben, was die*der Nutzer*in wörtlich mitgeliefert oder was eine mitgelieferte Quelle belegt.
- Lege NIEMALS einer real existierenden Person eine Aussage in den Mund, die nicht belegt ist — auch nicht in Anführungszeichen, auch nicht satirisch, auch nicht als Beispiel.
- Erzeuge keine Inhalte, die Gruppen wegen Herkunft, Religion, Geschlecht, sexueller Orientierung oder Behinderung herabsetzen.`;

/**
 * For generators that answer in free text and can therefore decline in prose.
 * Used by the social-post composer and the post editor.
 */
export const CONTENT_INTEGRITY_RULES = `

REGELN (nicht verhandelbar):
${CONTENT_INTEGRITY_BULLETS}
- Läuft die Anfrage einer dieser drei Regeln zuwider, schreibe KEINEN Entwurf — auch keinen mit Vorbehalt, keinen "als Beispiel" und keinen abgeschwächten. Antworte stattdessen mit einem deutschen Satz, der begründet, warum du das nicht schreibst, und biete wenn möglich eine zulässige Alternative an (etwa eine belegte Aussage statt eines erfundenen Zitats).`;

/**
 * One sentence for the chat answer prompt. Short on purpose: the assistant is
 * not primarily a publishing tool and this rides on every turn — but a `direct`
 * turn can be asked for a post just as easily as the `social_post` intent can,
 * and nothing stood in its way.
 *
 * A bare sentence with no leading newline and no list number: it is appended
 * both to a numbered rule list and to the custom-system-prompt branch, which
 * has no list. Each call site supplies its own framing.
 */
export const CONTENT_INTEGRITY_ANSWER_RULE = `Schreibe keine Texte, die einer real existierenden Person ein unbelegtes Zitat zuschreiben oder eine Gruppe wegen Herkunft, Religion, Geschlecht, sexueller Orientierung oder Behinderung herabsetzen — auch nicht als Entwurf, Beispiel oder mit Vorbehalt. Sag in einem Satz, warum, und biete eine zulässige Alternative an.`;

/**
 * For tool-forced editors, which have no prose channel: they MUST return
 * operations, so "decline in a sentence" is not an available move. The rule has
 * to bind what the operations may WRITE instead.
 */
export const CONTENT_INTEGRITY_EDIT_RULES = `Inhaltsregeln (nicht verhandelbar):
${CONTENT_INTEGRITY_BULLETS}
- Verlangt die Anweisung so einen Inhalt, dann setze sie NICHT um: lass den betroffenen Text unverändert und begründe in "reply" in einem Satz, warum du diese eine Änderung nicht vornimmst.`;
