import {
  vorlageFillPrompt,
  type SharepicDraftResponse,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

/**
 * `spec` with `text` written into it — a change request on the spec, so form,
 * layout and colours stay. Null when the draft fails: the caller decides
 * whether the spec goes on unfilled.
 */
export async function fillSpecWithText(
  spec: SharepicSpec,
  text: string
): Promise<Pick<SharepicDraftResponse, 'spec' | 'attributions'> | null> {
  const draft = await getContractsClient()
    .sharepicCreator.draft({ body: { current: spec, prompt: vorlageFillPrompt(text) } })
    .catch(() => null);
  return draft?.status === 200
    ? { spec: draft.body.spec, attributions: draft.body.attributions }
    : null;
}
