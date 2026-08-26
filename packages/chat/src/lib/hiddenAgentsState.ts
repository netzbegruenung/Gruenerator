/**
 * Welche Agenten ein Admin auf diesem Deployment ausgeblendet hat.
 *
 * Vom Host eingespeist, genau wie `instanceState.ts` — dieses Paket wird in das
 * Web-Bundle und in die React-Native-Binary gebaut, und die synchronen
 * Filterfunktionen (`getPinnedAgents`) können ein Query-Ergebnis nicht selbst
 * lesen. `useHiddenAgentIdentifiers` schiebt es hier herein.
 *
 * **Fail-open:** ohne Aufruf des Setters ist die Liste leer, also alles
 * sichtbar. Ein fehlgeschlagener Abruf darf den Katalog nicht leeren.
 *
 * Eigenes Modul aus demselben Grund wie `instanceState.ts`: `agents.ts` braucht
 * den Zustand, und `mentionables.ts` importiert `agents.ts` bereits — läge er
 * dort, wäre der Zyklus geschlossen.
 */
let hiddenAgentIdentifiers: readonly string[] = [];

export function setHiddenAgentIdentifiers(identifiers: readonly string[]): void {
  hiddenAgentIdentifiers = identifiers;
}

export function getHiddenAgentIdentifiers(): readonly string[] {
  return hiddenAgentIdentifiers;
}
