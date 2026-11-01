/**
 * Prüft die Naht, nicht den Dienst (der ist gemockt): AT bekommt 403 und die
 * Fassade wird nicht gerufen, ein ungültiger Body scheitert am Vertragsschema,
 * Plan und Refs erreichen die Fassade unverändert.
 */
import { bundestagAnswerRequestSchema, bundestagPlanRequestSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const planBundestagQuestion = vi.fn();
const answerBundestagQuestion = vi.fn();

vi.mock('../../services/bundestag/qa/index.js', () => ({
  planBundestagQuestion,
  answerBundestagQuestion,
}));

const reqDe = { headers: { 'x-user-locale': 'de-DE' } } as never;
const reqAt = { headers: { 'x-user-locale': 'de-AT' } } as never;

async function loadRouter() {
  return (await import('./bundestagQaContractRouter.js')).bundestagQaContractRouter;
}

beforeEach(() => {
  planBundestagQuestion.mockReset();
  answerBundestagQuestion.mockReset();
});

describe('bundestagQaContract', () => {
  it('plan: AT bekommt 403 ohne Fassadenaufruf', async () => {
    const router = await loadRouter();
    const res = await router.plan({
      req: reqAt,
      body: { question: 'Was ist Bürgergeld?' },
    } as never);
    expect(res.status).toBe(403);
    expect(planBundestagQuestion).not.toHaveBeenCalled();
  });

  it('answer: AT bekommt 403 ohne Fassadenaufruf', async () => {
    const router = await loadRouter();
    const res = await router.answer({
      req: reqAt,
      body: { question: 'Was ist Bürgergeld?' },
    } as never);
    expect(res.status).toBe(403);
    expect(answerBundestagQuestion).not.toHaveBeenCalled();
  });

  it('weist einen ungültigen Body am Schema ab', () => {
    expect(bundestagPlanRequestSchema.safeParse({ question: 'ab' }).success).toBe(false);
    expect(
      bundestagAnswerRequestSchema.safeParse({ question: 'Frage?', refs: Array(13).fill('20/1') })
        .success
    ).toBe(false);
  });

  it('plan: reicht Frage und Filter an die Fassade durch', async () => {
    const plan = {
      filters: {},
      keywords: [],
      notes: [],
      totals: { vorgaenge: 0, drucksachen: 0 },
      candidates: [],
    };
    planBundestagQuestion.mockResolvedValue(plan);
    const router = await loadRouter();
    const res = await router.plan({
      req: reqDe,
      body: { question: 'Was ist Bürgergeld?', filters: { wahlperiode: 21 } },
    } as never);
    expect(res).toEqual({ status: 200, body: plan });
    expect(planBundestagQuestion).toHaveBeenCalledWith({
      question: 'Was ist Bürgergeld?',
      filters: { wahlperiode: 21 },
    });
  });

  it('answer: Refs und Auftrag gehen an die Fassade', async () => {
    answerBundestagQuestion.mockResolvedValue({ answer: 'x' });
    const router = await loadRouter();
    const res = await router.answer({
      req: reqDe,
      body: { question: 'Was steht drin?', refs: ['21/123'], auftrag: 'zusammenfassung' },
    } as never);
    expect(res.status).toBe(200);
    expect(answerBundestagQuestion).toHaveBeenCalledWith({
      question: 'Was steht drin?',
      refs: ['21/123'],
      auftrag: 'zusammenfassung',
    });
  });

  it('answer: Fehler der Fassade werden nicht verschluckt', async () => {
    answerBundestagQuestion.mockRejectedValue(new Error('boom'));
    const router = await loadRouter();
    await expect(
      router.answer({ req: reqDe, body: { question: 'Was steht drin?' } } as never)
    ).rejects.toThrow('boom');
  });
});
