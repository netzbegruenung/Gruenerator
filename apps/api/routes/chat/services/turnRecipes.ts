/**
 * Welche Rezepte die Person für DIESEN Turn gewählt hat — aufgeteilt nach Rolle.
 *
 * Eine Textsorte (`skillRole === 'textsorte'`) gibt die Form vor und ist
 * exklusiv: es gibt genau einen Platz, `activeSkillMention`. Methoden-Rezepte
 * (Bundestag-Recherche, Rechtsstand) regeln Recherche, Belege und Zitierweise
 * und stapeln sich daneben (`methodSkillMentions`) — „recherchiere im Bundestag
 * und beantworte diese Bürgeranfrage" braucht beide.
 *
 * Quellen, jede kann eine Rolle tragen:
 *  - `skill:`-Token in der Nachricht (mehrere möglich, in Textreihenfolge),
 *  - `activeSkillMention` im Body (die getippte Wahl, sonst der Composer-Chip),
 *  - `ambientSkillMention` im Body (der Chip, wenn zusätzlich getippt wurde).
 *
 * Zwei Textsorten: der LETZTE Token gewinnt, dann der Body, dann der Chip —
 * dieselbe Reihenfolge wie vor der Rollentrennung („letzter gewinnt",
 * Token vor Body). Die verdrängten stehen in `droppedTextsorten` fürs Log.
 */
import { isMethodSkill } from '@gruenerator/shared/agents';

export interface TurnRecipePicks {
  /** Die eine Textsorte des Turns, oder null. */
  textsorte: string | null;
  /** Kam die Textsorte aus einem Token? Dann weicht die Body-id (`activeRecipeIdForTurn`). */
  textsorteFromToken: boolean;
  /** Methoden-Rezepte in Wahlreihenfolge, ohne Dubletten. */
  methods: string[];
  /** Gewählte, aber verdrängte Textsorten — nur fürs Log. */
  droppedTextsorten: string[];
}

export function partitionTurnRecipes(params: {
  tokenSkillMentions: readonly string[];
  bodySkillMention?: string | null | undefined;
  ambientSkillMention?: string | null | undefined;
}): TurnRecipePicks {
  const methods: string[] = [];
  const textsortenTokens: string[] = [];
  for (const mention of params.tokenSkillMentions) {
    if (isMethodSkill(mention)) methods.push(mention);
    else textsortenTokens.push(mention);
  }
  const bodyCandidates = [params.bodySkillMention, params.ambientSkillMention].filter(
    (m): m is string => typeof m === 'string' && m.length > 0
  );
  const bodyTextsorten: string[] = [];
  for (const mention of bodyCandidates) {
    if (isMethodSkill(mention)) methods.push(mention);
    else bodyTextsorten.push(mention);
  }

  const tokenWinner = textsortenTokens.at(-1) ?? null;
  const textsorte = tokenWinner ?? bodyTextsorten[0] ?? null;
  const allTextsorten = [...new Set([...textsortenTokens, ...bodyTextsorten])];
  return {
    textsorte,
    textsorteFromToken: tokenWinner !== null,
    methods: [...new Set(methods)],
    droppedTextsorten: allTextsorten.filter((m) => m !== textsorte),
  };
}
