/**
 * Name und Maß des Einbettungsmodells als nebenwirkungsfreie Konstanten.
 *
 * Sie stehen hier und nicht im Dienst, weil `embeddingPayload` sie an fünfzehn
 * Upsert-Stellen braucht — darunter sieben Scraper. Ein Import des Dienstes
 * zöge dort seinen Konstruktor samt Client mit; dieses Modul tut beim Import
 * nichts.
 */

export const EMBEDDING_MODEL_NAME = 'mistral-embed';

export const EMBEDDING_DIMENSIONS = 1024;
