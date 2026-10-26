/**
 * The one JSON body parser: `express.json` plus a cap on how many values a
 * body may hold.
 *
 * Bytes alone do not bound the work a body causes. zod collects one issue per
 * failing element, and only arrays with a `.max()` are rejected before their
 * elements are parsed (zod 4.6.6, GHSA-mrhx-c7xc-m3w5): 2 MB of `[1,1,…]`
 * against an unbounded `z.array(z.string())` cost ~460 MB of heap. Counting
 * values bounds that for every schema at once — contracts, `validateBody` and
 * hand-written `safeParse` alike — and also bounds what `JSON.parse` itself
 * allocates, because the count runs on the raw bytes before parsing.
 *
 * Legit bodies stay far below the cap: the chat request carries at most 300
 * board rows (`serializeBoardContext.ts`), sheets and docs sync over Yjs, and
 * large payloads are base64 strings, which count as one value.
 */

import { type IncomingMessage } from 'http';

import express, { type RequestHandler } from 'express';
import createError from 'http-errors';

import { createLogger } from '../utils/logger.js';

const log = createLogger('jsonBody');

export const MAX_JSON_VALUES = 100_000;

/** Bodies above this are logged, so the cap can be checked against real traffic. */
const REPORT_JSON_VALUES = 25_000;

const COMMA = 0x2c;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACKET = 0x5b;
const OPEN_BRACE = 0x7b;

/**
 * Roughly the number of values in a JSON text: commas and opened containers
 * outside strings. Stops counting once `stopAt` is passed. UTF-8 continuation
 * bytes never equal an ASCII quote or backslash, so a byte scan is exact.
 */
export function countJsonValues(body: Uint8Array, stopAt: number): number {
  let count = 0;
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const byte = body[i];
    if (inString) {
      if (byte === BACKSLASH) i++;
      else if (byte === QUOTE) inString = false;
    } else if (byte === QUOTE) {
      inString = true;
    } else if (byte === COMMA || byte === OPEN_BRACKET || byte === OPEN_BRACE) {
      if (++count > stopAt) return count;
    }
  }
  return count;
}

function verifyValueCount(
  req: IncomingMessage,
  _res: unknown,
  body: Buffer,
  encoding: string
): void {
  // `body` is the raw bytes, decoded only after this check. express.json also
  // takes utf-16/utf-32, where the byte scan would miscount: an escaped quote
  // desyncs it and the count drops below the cap. Our clients send UTF-8.
  if (encoding !== 'utf-8') {
    throw createError(415, `unsupported charset "${encoding.toUpperCase()}"`, {
      type: 'charset.unsupported',
    });
  }
  const count = countJsonValues(body, MAX_JSON_VALUES);
  if (count > MAX_JSON_VALUES) {
    log.warn(
      `Rejected JSON body with more than ${MAX_JSON_VALUES} values: ${req.method} ${req.url?.split('?')[0]}`
    );
    throw createError(413, `JSON body holds more than ${MAX_JSON_VALUES} values`, {
      type: 'entity.too.many.values',
    });
  }
  if (count > REPORT_JSON_VALUES) {
    log.info(`JSON body with ${count} values: ${req.method} ${req.url?.split('?')[0]}`);
  }
}

export function jsonBody(limit?: string): RequestHandler {
  return express.json({ ...(limit != null && { limit }), verify: verifyValueCount });
}
