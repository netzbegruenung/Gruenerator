/**
 * useBundestagQa — typisierte Hüllen um `bundestagQa.plan` / `.answer`.
 * Wirft bei allem ausser 200 mit einer pro Status passenden deutschen Meldung,
 * damit TanStack Query sie als Fehler zeigt (403 AT/Einwilligung, 429 Tageslimit).
 */
import {
  type BundestagAnswerRequest,
  type BundestagAnswerResponse,
  type BundestagPlanRequest,
  type BundestagPlanResponse,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';

function failure(status: number): Error {
  if (status === 403) {
    return new Error(
      'Kein Zugriff: Der Bundestag-Dienst ist nur für Deutschland verfügbar und braucht die KI-Einwilligung.'
    );
  }
  if (status === 429) {
    return new Error('Tageslimit erreicht. Bitte morgen erneut versuchen.');
  }
  return new ApiError(status, `Die Anfrage ist fehlgeschlagen (HTTP ${status}).`);
}

export async function fetchBundestagPlan(
  body: BundestagPlanRequest
): Promise<BundestagPlanResponse> {
  const result = await getContractsClient().bundestagQa.plan({ body });
  if (result.status !== 200) throw failure(result.status);
  return result.body;
}

export async function fetchBundestagAnswer(
  body: BundestagAnswerRequest
): Promise<BundestagAnswerResponse> {
  const result = await getContractsClient().bundestagQa.answer({ body });
  if (result.status !== 200) throw failure(result.status);
  return result.body;
}

export function useBundestagPlan() {
  return useMutation({ mutationFn: fetchBundestagPlan });
}

export function useBundestagAnswer() {
  return useMutation({ mutationFn: fetchBundestagAnswer });
}
