/**
 * Brand colours for MCP connectors, shared by the settings directory
 * (McpSection) and the chat mention picker so a service looks identical in both.
 * Unknown titles get a stable pseudo-random hue derived from the name.
 */
const BRAND: Record<string, string> = {
  Notion: '#0F0F0F',
  Coda: '#F46A54',
  'monday.com': '#FF3D57',
  Jamie: '#6366F1',
  Sally: '#4F46E5',
  HubSpot: '#FF7A59',
  Brevo: '#0B996E',
  Attio: '#1A1A1A',
  Statista: '#1F7BB6',
  SISTRIX: '#E5195F',
  Zapier: '#FF4A00',
  'Google Maps': '#4285F4',
  Tally: '#F24E43',
  Typeform: '#262627',
  'Typeform (EU)': '#262627',
  Zoom: '#2D8CFF',
  Todoist: '#E44332',
  Miro: '#050038',
  Goodnotes: '#2E7CF6',
  DocuSign: '#1F1646',
  IFTTT: '#000000',
  'Booking.com': '#003580',
  Expedia: '#00355F',
  trivago: '#007FAD',
  'Yahoo Finance': '#6001D2',
  Jotform: '#FF6100',
  'Swat.io': '#12B5A5',
};

export function mcpBrandColor(title: string): string {
  const hit = BRAND[title];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360} 52% 45%)`;
}
