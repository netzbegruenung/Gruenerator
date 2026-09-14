import { captureMeliousImpact, meliousModelFromRequest } from './meliousImpact.js';

/** The HTTP boundary is the only place Melious' environmental metadata survives. */
export const meliousFetchWithImpact: typeof fetch = async (input, init) => {
  const model = meliousModelFromRequest(init?.body);
  const response = await fetch(input, init);
  return captureMeliousImpact(response, model, init?.signal);
};
