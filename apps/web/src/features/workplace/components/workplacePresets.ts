import { agentsList, type AgentListItem, type ComposerPreset } from '@gruenerator/chat';
import { isLvItemVisibleForRoles } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useUserLandesverbaende } from '@/features/agentura/hooks/useUserLandesverbaende';
import { useAuthStore } from '@/stores/authStore';

const EXAMPLE_PROMPTS: Record<string, string> = {
  presse:
    'Pressemitteilung zur Verabschiedung unseres kommunalen Klimaschutzkonzepts: Solarpflicht auf Neubauten, Wärmenetz bis 2032, neues Radwegeprogramm. Mit Zitat unserer Fraktionssprecher*in und kurzem Ausblick.',
  rede: 'Rede für die Haushaltsdebatte im Stadtrat (5 Minuten): unsere Schwerpunkte Klima, Soziales und Bildung. Persönlicher Einstieg, drei konkrete Forderungen, kämpferischer Schluss.',
  bürgerservice:
    'Antwort auf eine Bürger*innenanfrage zum geplanten Mobilfunkmast in der Hauptstraße: Sachstand erklären, gesundheitliche Aspekte sachlich einordnen, auf Bürgerbeteiligungstermin hinweisen. Freundlich-bestimmter Ton.',
  instagram:
    'Instagram-Post zur Eröffnung unseres neuen Bürger*innenbüros am Samstag: Programm (Kaffee, Kinderecke, offene Sprechstunde), drei Hashtags, Call-to-Action zum Vorbeikommen.',
  facebook:
    'Facebook-Post zum heutigen Stadtratsbeschluss für die autofreie Innenstadt: Hintergrund in zwei Sätzen, was sich konkret ändert (Lieferzeiten, ÖPNV-Ausbau), Hinweis auf die nächste öffentliche Diskussion.',
  twitter:
    'Tweet zum heutigen Bundestagsbeschluss zum Heizungsgesetz: 280 Zeichen, klare grüne Position, ein passender Hashtag. Tonfall pointiert, aber nicht polemisch.',
  linkedin:
    'LinkedIn-Beitrag zu unserem Antrag für eine kommunale Wärmeplanung: Zielgruppe Fachpublikum aus Stadtwerken und Handwerk, sachlich, mit drei Argumenten und einer offenen Frage am Ende.',
  reel: 'Reel-Skript (30 Sekunden) zum Thema günstigerer ÖPNV: knackiger Hook, drei Fakten als Schnittfolge, Aufruf zum Kommentieren. Inkl. Kameraanweisungen und Texteinblendungen.',
  antrag:
    'Antrag im Stadtrat: Einrichtung einer dauerhaften Schulstraße rund um die Grundschule am Stadtpark. Begründung über Verkehrssicherheit, saubere Luft und Bewegung der Kinder; Verweis auf Pilotprojekte in vergleichbaren Kommunen.',
  wahlprogramm:
    'Wahlprogramm-Kapitel „Bezahlbares Wohnen" für die Kommunalwahl 2026: Mieter*innenschutz im Bestand, Ausbau kommunaler Wohnungsbau, Leerstandsabgabe. Drei Unterkapitel mit je zwei konkreten Maßnahmen.',
  aktion:
    'Aktionsideen für den Tag der Verkehrswende vor dem Rathaus: niedrigschwellig, fotogen, mit klarer Botschaft. Fünf Vorschläge mit Material-, Personen- und Genehmigungsbedarf.',
  'leichte-sprache':
    'Übersetze unsere Pressemitteilung zum neuen Klimaschutzgesetz in Leichte Sprache: kurze Sätze, klare Worte, Erklärungen für Fachbegriffe. Originaltext folgt: ',
};

function buildPresetText(agent: AgentListItem): string {
  const example = EXAMPLE_PROMPTS[agent.mention];
  if (example) {
    return `/${agent.mention} ${example}`;
  }
  const seed = agent.promptTemplate?.trim();
  return seed ? `/${agent.mention} ${seed}` : `/${agent.mention} `;
}

function toPreset(agent: AgentListItem): ComposerPreset {
  return {
    // `mention`, not `identifier`: a recipe's identifier is its OWNING AGENT, and
    // twenty recipes share ten of them — six of them `gruenerator-oeffentlichkeitsarbeit`
    // alone (Presse, Instagram, Facebook, Twitter, LinkedIn, Reel). Keying the
    // rendered list by it handed React six identical keys.
    key: agent.mention,
    title: agent.title,
    text: buildPresetText(agent),
  };
}

/**
 * The "Vorlagen" list in the Workplace composer's "+" menu.
 *
 * Every recipe used to become a preset, so the list carried all eleven
 * per-Landesverband entries ("PM Berlin", "Insta Brandenburg", …) for everyone,
 * regardless of locale or which Landesverband the user actually works in. Now
 * it matches the rest of the LV surfaces: locale first, then the roles from the
 * user's profile.
 *
 * A hook rather than a module constant because the answer depends on the signed-in
 * user. `resolveSkillMention` is untouched — typing `/presse-berlin` still works
 * for anyone, this only governs what the menu offers.
 */
export function useWorkplacePresets(): ComposerPreset[] {
  const { lvIds } = useUserLandesverbaende();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';

  return useMemo(
    () =>
      agentsList
        .filter(
          (agent) =>
            (agent.audience === undefined ||
              agent.audience === 'all' ||
              agent.audience === userLocale) &&
            isLvItemVisibleForRoles(agent.identifier, lvIds)
        )
        .map(toPreset),
    [lvIds, userLocale]
  );
}
