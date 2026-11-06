'use client';

import { getContractsClient } from '@gruenerator/shared/api';
import { useEffect } from 'react';

import { requestThreadListReload } from '../runtime/GrueneratorThreadListAdapter';

const STORAGE_KEY = 'gruenerator.dailyBriefing.requestedDay';

let memoryDay: string | null = null;
let inFlight = false;
/** Wie lange ein `pending` (Login-Hook rechnet noch) bis zur einen Nachfrage wartet. */
const PENDING_RETRY_MS = 4_000;

function berlinDay(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function readRequestedDay(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? memoryDay;
  } catch {
    return memoryDay;
  }
}

function writeRequestedDay(day: string): void {
  memoryDay = day;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, day);
  } catch {
    // storage unavailable: the in-memory guard still covers this session
  }
}

async function requestBriefing(retryPending = true): Promise<void> {
  const day = berlinDay();
  if (inFlight || readRequestedDay() === day) return;
  inFlight = true;
  try {
    const res = await getContractsClient().briefing.today();
    if (res.status !== 200) return;
    const { status, threadId } = res.body;
    // `pending` (the login hook is still building it) asks once more after a
    // few seconds. `disabled` is the default (opt-in) and counts as asked for
    // today; switching it on goes through `requestDailyBriefingNow`.
    if (status === 'pending') {
      if (retryPending) setTimeout(() => void requestBriefing(false), PENDING_RETRY_MS);
      return;
    }
    writeRequestedDay(day);
    if (status === 'created' || (status === 'exists' && threadId)) requestThreadListReload();
  } catch {
    // never block the app on the briefing
  } finally {
    inFlight = false;
  }
}

/**
 * Asks for today's Tagesbriefing right away, ignoring the once-a-day guard —
 * for the moment the switch in the settings is turned on.
 */
export function requestDailyBriefingNow(): void {
  memoryDay = null;
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the in-memory reset is enough
  }
  void requestBriefing();
}

/** Asks once per Berlin calendar day and device for today's Tagesbriefing. */
export function useDailyBriefing(): void {
  useEffect(() => {
    void requestBriefing();
  }, []);
}
