/**
 * Abstimmungen zu einem Thema über ALLE Mandate einer Person: jede Abstimmung
 * fragt das Mandat ihrer Wahlperiode. Live-Fall 29.10.2026: „wie hat Katrin
 * Uhlig beim Gebäudeenergiegesetz abgestimmt" fand nichts, weil nur das
 * laufende Mandat (2025–2029) gefragt wurde; die Stimme lag 2023.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  searchPoliticians: vi.fn(),
  getMandates: vi.fn(),
  getVotes: vi.fn(),
  getSideJobs: vi.fn(),
  searchPolls: vi.fn(),
  getPollTally: vi.fn(),
};

vi.mock('../api-clients/abgeordnetenwatchApiClient.js', () => ({
  getAbgeordnetenwatchClient: vi.fn(async () => client),
}));
vi.mock('../bundestag/PersonDetectionService.js', () => ({
  getPersonDetectionService: () => ({
    extractNameFromQuery: vi.fn(() => 'Katrin Uhlig'),
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { getEnrichedPoliticianService } from './EnrichedPoliticianService.js';

const mandate = (mandateId: number, parliamentPeriodId: number, parliamentPeriod: string) => ({
  mandateId,
  politicianId: 175599,
  politicianName: 'Katrin Uhlig',
  parliamentPeriod,
  parliamentPeriodId,
  fraction: 'BÜNDNIS 90/DIE GRÜNEN',
});
const poll = (pollId: number, legislatureId: number) => ({
  pollId,
  label: 'Gebäudeenergiegesetz',
  date: '2023-09-08',
  accepted: true,
  topics: [],
  intro: null,
  legislatureId,
  url: '',
});

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset();
  client.searchPoliticians.mockResolvedValue([
    { id: 175599, name: 'Katrin Uhlig', party: 'GRÜNE', url: '' },
  ]);
  client.getMandates.mockResolvedValue([
    mandate(68942, 161, 'Bundestag 2025 - 2029'),
    mandate(53801, 132, 'Bundestag 2021 - 2025'),
  ]);
  client.getSideJobs.mockResolvedValue([]);
  client.getVotes.mockImplementation(async (o: { mandateId: number; pollId?: number }) =>
    o.pollId === 5162 && o.mandateId === 53801
      ? [{ pollId: 5162, pollLabel: 'Gebäudeenergiegesetz', vote: 'yes', fraction: null, url: '' }]
      : []
  );
});

describe('Abstimmungen zu einem Thema über alle Mandate', () => {
  it('nimmt getrennt übergebene Person und Thema statt der Erkennung', async () => {
    client.searchPolls.mockImplementation(async (o: { keyword?: string }) =>
      o.keyword === 'Gebäudeenergiegesetz' ? [poll(5162, 132)] : []
    );
    const r = await getEnrichedPoliticianService().search('egal was hier steht', {
      person: 'Katrin Uhlig',
      thema: 'Gebäudeenergiegesetz',
    });
    expect(client.searchPoliticians).toHaveBeenCalledWith('Katrin Uhlig', 5);
    expect(r.person?.topicVotes).toHaveLength(1);
  });

  it('findet die GEG-Stimme von 2023 über das Mandat der passenden Wahlperiode', async () => {
    client.searchPolls.mockResolvedValue([poll(5162, 132)]);
    const r = await getEnrichedPoliticianService().search('Katrin Uhlig Gebäudeenergiegesetz');
    expect(r.kind).toBe('person');
    expect(r.person?.topicVotes).toEqual([expect.objectContaining({ pollId: 5162, vote: 'yes' })]);
    expect(client.getVotes).toHaveBeenCalledWith({ mandateId: 53801, pollId: 5162, limit: 1 });
  });

  it('sucht bei einem Mehrwortthema auch nach dem längsten Einzelwort', async () => {
    client.searchPolls.mockImplementation(async (o: { keyword?: string }) =>
      o.keyword === 'gebäudeenergiegesetz' ? [poll(5162, 132)] : []
    );
    const r = await getEnrichedPoliticianService().search(
      'Katrin Uhlig Gebäudeenergiegesetz Abstimmung'
    );
    expect(r.person?.topicVotes).toHaveLength(1);
  });

  it('nennt ohne Treffer die durchsuchten Wahlperioden und den amtlichen Namen', async () => {
    client.searchPolls.mockResolvedValue([]);
    const r = await getEnrichedPoliticianService().search('Katrin Uhlig Heizungsgesetz');
    expect(r.notes.join(' ')).toMatch(/Bundestag 2025 - 2029, Bundestag 2021 - 2025/);
    expect(r.notes.join(' ')).toMatch(/amtlichen Namen/);
  });
});
