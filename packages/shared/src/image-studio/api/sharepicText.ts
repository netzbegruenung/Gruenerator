/**
 * Der eine Weg zur Sharepic-Textgenerierung.
 *
 * Vorher rief jede Plattform den Endpunkt selbst und beschrieb die Antwort
 * dabei neu — Web über `useApiSubmit` + einen Antwort-Parser, Mobile über den
 * rohen axios-Client, beide mit eigenen, teils falschen Interfaces. Hier läuft
 * es über den ts-rest-Vertrag: Route und Antwortform kommen aus
 * `@gruenerator/contracts`, es gibt nichts mehr zu raten.
 */
import { getContractsClient } from '../../api/contractsClient.js';

import type {
  DreizeilenAtTextResponse,
  DreizeilenTextResponse,
  InfoAtTextResponse,
  InfoTextResponse,
  SharepicSliderTextBody,
  SharepicTextBody,
  SimpleTextResponse,
  SliderTextResponse,
  VeranstaltungTextResponse,
  ZitatTextResponse,
} from '@gruenerator/contracts';

/**
 * Der Typ-Bezeichner, den der Backend-Handler kennt — zugleich das letzte
 * Pfadsegment. Bewusst NICHT `ImageStudioTemplateType`: das Web kennt eigene
 * IDs (`zitat-pure`, AT-Varianten, `freeform`), und die Zuordnung dorthin
 * gehört der jeweiligen App, nicht diesem Modul.
 */
export type SharepicTextType =
  | 'dreizeilen'
  | 'zitat'
  | 'zitat_pure'
  | 'info'
  | 'veranstaltung'
  | 'simple'
  | 'slider'
  // Österreich: eigene Sujets mit eigenen Feldern, deshalb eigene Typen —
  // nicht dieselben Typen plus ein Locale-Flag.
  | 'dreizeilen_at'
  | 'info_at';

export interface SharepicTextResponseByType {
  dreizeilen: DreizeilenTextResponse;
  zitat: ZitatTextResponse;
  zitat_pure: ZitatTextResponse;
  info: InfoTextResponse;
  veranstaltung: VeranstaltungTextResponse;
  simple: SimpleTextResponse;
  slider: SliderTextResponse;
  dreizeilen_at: DreizeilenAtTextResponse;
  info_at: InfoAtTextResponse;
}

/**
 * Ruft die Vertragsroute zum Typ auf.
 *
 * Wirft bei jedem Status ausser 200 mit der Servermeldung. Die trägt bei 400
 * auch die Ablehnung des Modells (`Ablehnung: …`) — die gehört unverändert vor
 * die Nutzerin, nicht hinter ein generisches „Fehler bei der Generierung".
 */
export async function generateSharepicText<T extends SharepicTextType>(
  type: T,
  body: T extends 'slider' ? SharepicSliderTextBody : SharepicTextBody
): Promise<SharepicTextResponseByType[T]> {
  const client = getContractsClient().sharepicText;

  const res = await (() => {
    switch (type) {
      case 'dreizeilen':
        return client.generateDreizeilen({ body });
      case 'zitat':
        return client.generateZitat({ body });
      case 'zitat_pure':
        return client.generateZitatPure({ body });
      case 'info':
        return client.generateInfo({ body });
      case 'veranstaltung':
        return client.generateVeranstaltung({ body });
      case 'simple':
        return client.generateSimple({ body });
      case 'dreizeilen_at':
        return client.generateDreizeilenAt({ body });
      case 'info_at':
        return client.generateInfoAt({ body });
      case 'slider':
        return client.generateSlider({ body: body as SharepicSliderTextBody });
      default: {
        const exhaustive: never = type;
        throw new Error(`Unbekannter Sharepic-Texttyp: ${String(exhaustive)}`);
      }
    }
  })();

  if (res.status === 200) {
    return res.body as SharepicTextResponseByType[T];
  }

  const body400 = res.body as { error?: unknown } | undefined;
  const message =
    typeof body400?.error === 'string' ? body400.error : 'Textgenerierung fehlgeschlagen';
  throw new Error(message);
}
