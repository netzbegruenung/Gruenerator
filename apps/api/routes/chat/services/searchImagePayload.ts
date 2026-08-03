/**
 * Attach a signed proxy handle to a web-search image hit on its way to the client.
 *
 * Signing happens HERE, at the moment we hand the URL out, rather than in the
 * search node: that is what makes the proxy's capability check meaningful. The
 * proxy will serve a URL only if this function signed it, so the set of fetchable
 * targets is exactly the set of images a search actually returned.
 *
 * When no secret is configured `proxyUrl` is simply absent and the client falls
 * back to a plain link. That degradation is deliberate and must stay silent-safe:
 * the feature loses thumbnails, never its privacy property.
 */

import { buildImageProxyPath } from '../../../services/search/imageProxySignature.js';

import type { WebImageResult } from '../../../agents/langgraph/ChatGraph/types.js';

export interface SearchImagePayload extends WebImageResult {
  proxyUrl?: string;
}

export function withImageProxy(image: WebImageResult): SearchImagePayload {
  const proxyUrl = buildImageProxyPath(image.url);
  return proxyUrl ? { ...image, proxyUrl } : image;
}
