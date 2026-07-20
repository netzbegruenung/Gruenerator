/**
 * Deutsche-Bahn chat card payload (EXPERIMENTAL) — the condensed departure
 * board a `bahn` turn renders as a rich card. Built server-side from DB IRIS
 * timetable JSON (system MCP source), consumed by packages/chat BahnCard.
 */
import { z } from 'zod';

export const bahnEntrySchema = z.object({
  id: z.string(),
  /** Train category — ICE, IC, RE, RB, S, ... */
  category: z.string(),
  /** Train number ("204") or line label ("RE8") when present. */
  number: z.string(),
  line: z.string().nullable(),
  departureTime: z.string().nullable(),
  departurePlatform: z.string().nullable(),
  arrivalTime: z.string().nullable(),
  arrivalPlatform: z.string().nullable(),
  /** Final stop of the departing train (last of the planned path). */
  destination: z.string().nullable(),
  /** Shortened via stations (first stops of the onward path). */
  via: z.array(z.string()),
});
export type BahnEntry = z.infer<typeof bahnEntrySchema>;

export const bahnPayloadSchema = z.object({
  kind: z.literal('timetable'),
  station: z.string(),
  /** ISO date ("2026-07-17") when derivable from the query, else null. */
  date: z.string().nullable(),
  /** Hour window of the board ("09"), else null. */
  hour: z.string().nullable(),
  entries: z.array(bahnEntrySchema),
});
export type BahnPayload = z.infer<typeof bahnPayloadSchema>;
