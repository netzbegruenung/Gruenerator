import { type GetTransparencyStatsResponseDto } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { deriveFigures, formatMinutes, joinList, shareInWords } from './figures';

function response(
  overrides: Partial<GetTransparencyStatsResponseDto> = {}
): GetTransparencyStatsResponseDto {
  const base = {
    success: true,
    days: 30,
    since: '2026-10-28',
    generated_at: '2026-11-27T00:00:00.000Z',
    min_group_size: 5,
    sufficient_data: true,
    active_users: 100,
    suppressed_days: 0,
    totals: {
      requests: 44_617,
      input_tokens: 22_000_000,
      output_tokens: 1_000_000,
      total_tokens: 23_000_000,
      images: 0,
      transcriptions: 0,
      searches: 0,
      speech_seconds: 0,
    },
    footprint: {
      energy_wh: 251_000,
      energy_wh_low: 243_000,
      energy_wh_high: 272_000,
      emissions_g: 83_000,
      emissions_g_low: 81_000,
      emissions_g_high: 88_000,
      measured_share: 0.91,
      calibrated_share: 0.06,
      bounded_share: 0.03,
      covered_share: 0.98,
      image_energy_wh: 0,
      image_emissions_g: 0,
      reference_energy_wh: 0,
      reference_emissions_g: 0,
      market_emissions_g: 60_000,
      image_market_emissions_g: 0,
      market_backed_share: 0.4,
      unvalued_ops: { transcriptions: 0, searches: 0, speech_seconds: 0 },
    },
    calculation: {} as GetTransparencyStatsResponseDto['calculation'],
    providers: [
      {
        provider: 'mistral',
        grid_g_per_kwh: 22,
        pue: 1.5,
        pue_estimated: true,
        energy_wh: 50_000,
        emissions_g: 1_000,
      },
      {
        provider: 'melious',
        grid_g_per_kwh: 380,
        pue: 1.2,
        pue_estimated: false,
        energy_wh: 200_000,
        emissions_g: 76_000,
      },
    ],
    daily: [],
    byFeature: [],
    byModel: [],
  } satisfies GetTransparencyStatsResponseDto;
  return { ...base, ...overrides };
}

describe('deriveFigures', () => {
  it('derives the story figures from the response alone', () => {
    const f = deriveFigures(response());
    expect(f.whPerRequest).toBeCloseTo(5.63, 2);
    expect(f.gramsPerKwh).toBeCloseTo(330.7, 1);
    // 83 kg at 164 g per person-km, the constant the personal page uses too.
    expect(Math.round(f.carKm)).toBe(506);
    expect(f.gramsPerRequest).toBeCloseTo(1.86, 2);
    expect(f.gramsPerDay).toBeCloseTo(2766.7, 1);
    expect(f.gramsPerSecond).toBeCloseTo(0.032, 3);
    expect(f.readPerWritten).toBe(22);
    expect(f.mainProvider).toBe('melious');
    expect(f.marketEmissionsG).toBe(60_000);
  });

  it('groups areas into chat, images and the rest, with briefing counted as chat', () => {
    const f = deriveFigures(
      response({
        byFeature: (
          [
            { feature: 'chat', emissions_g: 50 },
            { feature: 'briefing', emissions_g: 7 },
            { feature: 'sharepic', emissions_g: 13 },
            { feature: 'docs', emissions_g: 10 },
            { feature: 'other', emissions_g: 3 },
          ] as const
        ).map((e) => ({
          ...e,
          requests: 1,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          images: 0,
          transcriptions: 0,
          searches: 0,
          speech_seconds: 0,
        })),
      })
    );
    expect(f.groups).toEqual({ chat: 57, images: 13, rest: 13 });
  });

  it('lists lanes without footprint from the model split and the unvalued counts', () => {
    const base = response();
    const f = deriveFigures({
      ...base,
      footprint: {
        ...base.footprint,
        unvalued_ops: { transcriptions: 3, searches: 0, speech_seconds: 0 },
      },
      byModel: [
        {
          provider: 'deepl',
          model: 'translate',
          unit: 'characters',
          requests: 0,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          ops: 500,
        },
        {
          provider: 'mistral',
          model: 'ocr',
          unit: 'ocr_pages',
          requests: 0,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          ops: 0,
        },
      ],
    });
    expect(f.unvaluedFunctions).toEqual(['Spracherkennung', 'Übersetzung']);
  });

  it('drops the green-power figure when it saves nothing', () => {
    const base = response();
    const f = deriveFigures({
      ...base,
      footprint: { ...base.footprint, market_emissions_g: 83_000 },
    });
    expect(f.marketEmissionsG).toBeNull();
  });

  it('survives an empty window without dividing by zero', () => {
    const base = response();
    const f = deriveFigures({
      ...base,
      totals: { ...base.totals, requests: 0, output_tokens: 0 },
      footprint: { ...base.footprint, energy_wh: 0 },
      providers: [],
    });
    expect(f.whPerRequest).toBe(0);
    expect(f.gramsPerKwh).toBe(0);
    expect(f.readPerWritten).toBeNull();
    expect(f.mainProvider).toBeNull();
  });
});

describe('wording helpers', () => {
  it('says shares the way a person would', () => {
    expect(shareInWords(0.69)).toBe('Gut zwei Drittel');
    expect(shareInWords(0.5)).toBe('Rund die Hälfte');
    expect(shareInWords(0.97)).toBe('Fast alles');
  });

  it('joins lists and rounds durations', () => {
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B und C');
    expect(formatMinutes(33.6)).toBe('34 Minuten');
    expect(formatMinutes(150)).toBe('3 Stunden');
  });
});
