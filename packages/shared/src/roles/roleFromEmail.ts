/**
 * Eine Rolle, die sich aus der Mailadresse ablesen lässt — als Vorschlag im
 * Rollen-Assistenten, nie als Zuteilung.
 *
 * Wer eine Adresse auf der Domain eines Landesverbands hat, arbeitet sehr
 * wahrscheinlich in dessen Landesgeschäftsstelle. Der Assistent bietet dann
 * „Mitarbeiter*in Landesgeschäftsstelle · <Land>" vorausgewählt an; bestätigen
 * oder ändern muss die Person selbst. Ein Vorschlag ist bewusst kein Zugang: die
 * LV-Inhalte schaltet weiterhin allein die gespeicherte Rolle frei
 * (`landesverbandIdsForRoles`), und die Domain einer Adresse beweist nichts.
 *
 * Österreich bleibt außen vor: die Landesorganisationen schreiben über
 * `gruene.at`, dieselbe Domain wie die Bundespartei, die Adresse sagt also nicht,
 * wo jemand arbeitet.
 */
import { DE_BUNDESLAENDER, DE_ROLLEN } from './rolesConfig.js';
import { type UserRole } from './types.js';

const LGS_ROLLE = 'Mitarbeiter*in Landesgeschäftsstelle';

/**
 * Maildomain der Landesverbände → Bundesland-Label aus `DE_BUNDESLAENDER`. Die
 * Labels müssen exakt dort stehen (der Test prüft das), weil genau darüber die
 * Rolle ihrem Landesverband zugeordnet wird.
 */
const LV_MAIL_DOMAINS: Readonly<Record<string, string>> = {
  'gruene-bw.de': 'Baden-Württemberg',
  'gruene-bayern.de': 'Bayern',
  'gruene-berlin.de': 'Berlin',
  'gruene.berlin': 'Berlin',
  'gruene-brandenburg.de': 'Brandenburg',
  'gruene-bremen.de': 'Bremen',
  'gruene-hamburg.de': 'Hamburg',
  'gruene-hessen.de': 'Hessen',
  'gruene-mv.de': 'Mecklenburg-Vorpommern',
  'gruene-niedersachsen.de': 'Niedersachsen',
  'gruene-nrw.de': 'Nordrhein-Westfalen',
  'gruene-rlp.de': 'Rheinland-Pfalz',
  'gruene-saar.de': 'Saarland',
  'gruene-sachsen.de': 'Sachsen',
  'gruene-lsa.de': 'Sachsen-Anhalt',
  'sh-gruene.de': 'Schleswig-Holstein',
  'gruene-thueringen.de': 'Thüringen',
};

/** Für den Test: jedes Label muss ein Bundesland des Assistenten sein. */
export const LV_MAIL_DOMAIN_BUNDESLAENDER: readonly string[] = Object.values(LV_MAIL_DOMAINS);

/**
 * Die Landesgeschäftsstellen-Rolle zur Mailadresse, oder `null`, wenn die
 * Domain keinem Landesverband gehört. Nur die Domain selbst zählt, keine
 * Subdomain: `kv.gruene-hessen.de` wäre ein Kreisverband, keine
 * Landesgeschäftsstelle.
 */
export function suggestedRoleForEmail(
  email: string | null | undefined,
  locale: string
): UserRole | null {
  if (locale === 'de-AT' || !email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return null;

  const bundesland =
    LV_MAIL_DOMAINS[
      email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    ];
  if (!bundesland) return null;
  if (!DE_BUNDESLAENDER.some((bl) => bl.label === bundesland)) return null;
  if (!(DE_ROLLEN.land ?? []).includes(LGS_ROLLE)) return null;

  return { ebene: 'land', rolle: LGS_ROLLE, bundesland };
}
