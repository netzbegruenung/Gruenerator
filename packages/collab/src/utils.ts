const COLLABORATION_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
];

export function generateUserColor(): string {
  return COLLABORATION_COLORS[Math.floor(Math.random() * COLLABORATION_COLORS.length)]!;
}
