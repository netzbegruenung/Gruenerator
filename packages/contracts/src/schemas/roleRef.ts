import { z } from 'zod';

/**
 * Verweis auf eine gespeicherte Rolle einer Person.
 *
 * Der Prompttext einer Katalogrolle ist parteiintern und wird server-seitig
 * aufgelöst — über die Leitung geht deshalb nur diese Referenz. Ebene UND
 * Bezeichnung, weil dieselbe Bezeichnung auf mehreren Ebenen vorkommt
 * („Presse & Social-Media" im Kreis- wie im Ortsverband).
 *
 * Ein Schema für beide Wege: der Chat-Request (`chatGraph`) und die
 * Thread-Einstellungen (`threads`), die ihn über einen Neuladen retten.
 */
export const roleRefSchema = z.object({
  ebene: z.string(),
  rolle: z.string(),
});

export type RoleRef = z.infer<typeof roleRefSchema>;
