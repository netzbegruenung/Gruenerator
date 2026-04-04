export const MEINUNGSBILD_CATEGORIES: Record<string, string> = {
  climate: 'Klima',
  energy: 'Energie',
  transport: 'Mobilität',
  social: 'Soziales',
  economy: 'Wirtschaft',
  immigration: 'Zuwanderung',
  eu: 'Europa',
  foreign: 'Außenpolitik',
  institutions: 'Institutionen',
  affect: 'Stimmungen',
  culture: 'Kultur',
  economy_perception: 'Wirtschaftslage',
  digital: 'Digitales',
  justice: 'Gerechtigkeit',
  engagement: 'Engagement',
  populism: 'Populismus',
  trust: 'Vertrauen',
  government: 'Regierung',
};

export const FEATURED_ISSUES = new Set([
  'climate_ego',
  'fossil_fuel_levy',
  'nuclear_energy',
  'speed_limit',
  'buergergeld_cut',
  'rent_control',
  'same_sex_marriage',
  'income_reduce',
  'higher_earners_tax',
  'debt_brake',
  'immigration_restrict',
  'immigration_econ_good',
  'ukraine_arms',
  'eu_integration',
  'voting_age_16',
  'democracy_satisfaction',
]);

export const CATEGORY_ORDER = [
  'climate',
  'energy',
  'transport',
  'social',
  'economy',
  'immigration',
  'foreign',
  'eu',
  'institutions',
  'affect',
  'economy_perception',
  'culture',
  'digital',
  'justice',
  'engagement',
  'populism',
  'trust',
  'government',
];

export function estimateColor(value: number): string {
  if (value >= 0.6) return 'bg-primary-600';
  if (value >= 0.5) return 'bg-primary-500';
  if (value >= 0.4) return 'bg-primary-400';
  if (value >= 0.3) return 'bg-grey-400';
  return 'bg-grey-300';
}
