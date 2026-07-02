/**
 * Unit tests for the Abgeordnetenwatch document builders.
 *
 * These pin the ingest invariants that matter for the notebook without needing
 * Qdrant/Mistral/HTTP:
 *   1. Poll docs carry the right content_type, Grünen stance + majority direction,
 *      and strip HTML out of the embedded text.
 *   2. Sidejob docs join to the MP (name + party), parse income_level, and namespace
 *      the point id apart from polls.
 *   3. Grünen-stance aggregation only counts the Grünen fraction and derives the
 *      majority direction (incl. 'uneinheitlich' on a tie, 'keine' when absent).
 */
import { describe, it, expect } from 'vitest';

import {
  aggregateGrueneStance,
  buildPollDocument,
  buildSidejobDocument,
  deriveParliament,
  deriveParty,
  mandateToInfo,
  parseMandateLabel,
  stripHtml,
  POLL_ID_BASE,
  SIDEJOB_ID_BASE,
  type RawPoll,
  type RawSidejob,
  type RawMandate,
  type RawVote,
} from './builders.js';

const hash = (s: string) => `h${s.length}`;

describe('helpers', () => {
  it('deriveParliament strips the year range', () => {
    expect(deriveParliament('Bundestag 2025 - 2029')).toBe('Bundestag');
    expect(deriveParliament('EU-Parlament 2024 - 2029')).toBe('EU-Parlament');
    expect(deriveParliament(null)).toBeNull();
  });

  it('deriveParty strips the parenthetical', () => {
    expect(deriveParty('EVP (EU-Parlament 2024 - 2029)')).toBe('EVP');
    expect(deriveParty('BÜNDNIS 90/DIE GRÜNEN (Bundestag 2025 - 2029)')).toBe(
      'BÜNDNIS 90/DIE GRÜNEN'
    );
  });

  it('stripHtml removes tags and named/numeric/hex entities', () => {
    expect(stripHtml('<p>Der  <b>Bundestag</b>\n hat</p>')).toBe('Der Bundestag hat');
    expect(stripHtml('Gr&#252;ne &amp; Co. &#x2013; Ende')).toBe('Gr ne Co. Ende');
  });

  it('parseMandateLabel extracts person + parliament from the mandate label', () => {
    expect(parseMandateLabel('Albert Stegemann (Bundestag 2021 - 2025)')).toEqual({
      person: 'Albert Stegemann',
      parliament: 'Bundestag',
    });
    expect(parseMandateLabel('Jane Doe')).toEqual({ person: 'Jane Doe', parliament: null });
    expect(parseMandateLabel(null)).toEqual({ person: null, parliament: null });
  });
});

describe('aggregateGrueneStance', () => {
  const votes: RawVote[] = [
    { vote: 'yes', fraction: { label: 'BÜNDNIS 90/DIE GRÜNEN (Bundestag)' } },
    { vote: 'yes', fraction: { label: 'BÜNDNIS 90/DIE GRÜNEN (Bundestag)' } },
    { vote: 'no', fraction: { label: 'BÜNDNIS 90/DIE GRÜNEN (Bundestag)' } },
    { vote: 'yes', fraction: { label: 'SPD' } }, // ignored — not Grüne
    { vote: 'no_show', fraction: { label: 'Grüne (Landtag)' } },
  ];

  it('counts only the Grünen fraction and picks the majority', () => {
    const { counts, direction } = aggregateGrueneStance(votes);
    expect(counts).toEqual({ yes: 2, no: 1, abstain: 0, no_show: 1 });
    expect(direction).toBe('ja');
  });

  it('returns "keine" when the Grünen cast no vote', () => {
    expect(aggregateGrueneStance([{ vote: 'yes', fraction: { label: 'CDU' } }]).direction).toBe(
      'keine'
    );
  });

  it('returns "uneinheitlich" on a tie', () => {
    const tie: RawVote[] = [
      { vote: 'yes', fraction: { label: 'Grüne' } },
      { vote: 'no', fraction: { label: 'Grüne' } },
    ];
    expect(aggregateGrueneStance(tie).direction).toBe('uneinheitlich');
  });
});

describe('buildPollDocument', () => {
  const poll: RawPoll = {
    id: 6575,
    label: 'Bundeswehreinsatz im Libanon',
    field_intro: '<p>Der Bundestag hat <b>beschlossen</b>…</p>',
    field_poll_date: '2026-06-25',
    field_accepted: true,
    field_legislature: { label: 'Bundestag 2025 - 2029' },
    field_topics: [{ label: 'Außenpolitik' }, { label: 'Verteidigung' }],
    abgeordnetenwatch_url: 'https://www.abgeordnetenwatch.de/bundestag/abstimmungen/libanon',
  };

  it('maps a poll to a trimmed, HTML-free document', () => {
    const stance = aggregateGrueneStance([
      { vote: 'no', fraction: { label: 'Grüne' } },
      { vote: 'no', fraction: { label: 'Grüne' } },
    ]);
    const { text, payload } = buildPollDocument(poll, stance, hash);

    expect(payload.content_type).toBe('abstimmung');
    expect(payload.document_id).toBe('aw_poll_6575');
    expect(payload.parliament).toBe('Bundestag');
    expect(payload.gruene_vote).toBe('nein');
    expect(payload.accepted).toBe(true);
    expect(payload.primary_category).toBe('Außenpolitik');
    expect(payload.source_url).toBe(
      'https://www.abgeordnetenwatch.de/bundestag/abstimmungen/libanon'
    );
    expect(text).not.toContain('<');
    expect(text).toContain('mehrheitlich nein');
    expect(text).toContain('Ergebnis: angenommen am 2026-06-25');
  });
});

describe('buildSidejobDocument', () => {
  const sidejob: RawSidejob = {
    id: 42,
    label: 'Vertragspartner',
    income_level: '10',
    job_title_extra: 'Einkommen im Jahr 2022',
    data_change_date: '2023-05-01',
    sidejob_organization: { label: 'Landwirtschaftsbetrieb' },
    field_topics: [{ label: 'Landwirtschaft' }],
    mandates: [{ id: 70563, label: 'Albert Stegemann (Bundestag 2021 - 2025)' }],
  };

  it('derives person + parliament from the mandate label, party from the map', () => {
    const { text, payload } = buildSidejobDocument(
      sidejob,
      { politician: 'ignored', party: 'CDU/CSU', parliament: 'ignored' },
      hash
    );
    expect(payload.content_type).toBe('nebentaetigkeit');
    expect(payload.document_id).toBe('aw_sidejob_42');
    expect(payload.person).toBe('Albert Stegemann'); // from label, not the map
    expect(payload.parliament).toBe('Bundestag'); // from label
    expect(payload.party).toBe('CDU/CSU'); // best-effort from map
    expect(payload.income_level).toBe('10'); // string for keyword facet
    // published_at must be an ISO date (date_range facet), never the "Jahr" prose
    expect(payload.published_at).toBe('2023-05-01');
    expect(payload.year).toBe('Einkommen im Jahr 2022');
    expect(text).toContain('Albert Stegemann');
    expect(text).toContain('Einkommensstufe: 10/10');
    // point-id namespaces never collide with polls
    expect(SIDEJOB_ID_BASE + 42).not.toBe(POLL_ID_BASE + 42);
  });

  it('still resolves person from the label when the mandate map misses (party null)', () => {
    const { payload } = buildSidejobDocument(sidejob, null, hash);
    expect(payload.person).toBe('Albert Stegemann');
    expect(payload.parliament).toBe('Bundestag');
    expect(payload.party).toBeNull();
  });

  it('keeps a legitimate income_level of 0 instead of coercing to null', () => {
    const { payload } = buildSidejobDocument({ ...sidejob, income_level: '0' }, null, hash);
    expect(payload.income_level).toBe('0');
  });
});

describe('mandateToInfo', () => {
  it('takes the current fraction membership (valid_until null)', () => {
    const m: RawMandate = {
      id: 70563,
      politician: { label: 'Jane Doe' },
      parliament_period: { label: 'Bundestag 2025 - 2029' },
      fraction_membership: [
        { fraction: { label: 'SPD (Bundestag)' }, valid_until: '2024-01-01' },
        { fraction: { label: 'BÜNDNIS 90/DIE GRÜNEN (Bundestag)' }, valid_until: null },
      ],
    };
    expect(mandateToInfo(m)).toEqual({
      politician: 'Jane Doe',
      party: 'BÜNDNIS 90/DIE GRÜNEN',
      parliament: 'Bundestag',
    });
  });
});
