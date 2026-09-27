/**
 * Der Helfer trägt eine Konstante, hat aber trotzdem einen Riegel verdient:
 * er ist die einzige Stelle, an der der Modellname die Schreibseite erreicht,
 * und ein leerer oder fehlender Wert wäre von „alter Punkt" nicht zu
 * unterscheiden.
 */

import { describe, expect, it } from 'vitest';

import { EMBEDDING_MODEL_NAME } from '../mistral/MistralEmbeddingService/modelConstants.js';

import { embeddingPayload } from './embeddingProvenance.js';

describe('embeddingPayload', () => {
  it('liefert den snake_case-Schlüssel mit dem Namen des lebenden Modells', () => {
    expect(embeddingPayload()).toEqual({ embedding_model: 'mistral-embed' });
  });

  it('bleibt an die Konstante gebunden, die auch der Dienst benutzt', () => {
    // Der Test hinge sonst am Literal und bliebe grün, wenn der Dienst auf ein
    // anderes Modell umgestellt wird und der Payload weiter das alte behauptet.
    expect(embeddingPayload().embedding_model).toBe(EMBEDDING_MODEL_NAME);
  });

  it('liefert nie einen leeren Wert — der wäre von „altem Punkt" nicht zu trennen', () => {
    expect(embeddingPayload().embedding_model.length).toBeGreaterThan(0);
  });
});
