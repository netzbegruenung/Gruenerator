/**
 * Ids der Notebook-Quellen, die nicht aus unserem Qdrant, sondern über die
 * HTTP-API eines anderen Dienstes bedient werden. Eigene Datei ohne Importe,
 * damit `config/systemCollectionsConfig.ts` den Typ ziehen kann, ohne die
 * Adapter (und deren Importe aus der Config) mitzuladen.
 */
export const REMOTE_SOURCE_IDS = ['bundestag-wrapped'] as const;

export type RemoteSourceId = (typeof REMOTE_SOURCE_IDS)[number];
