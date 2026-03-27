/**
 * System library items for the Excalidraw whiteboard.
 *
 * To create new items:
 * 1. Open excalidraw.com
 * 2. Draw the shapes you want
 * 3. Select them → "Add to library"
 * 4. Export library as .excalidrawlib
 * 5. Paste the libraryItems array entries here
 *
 * All system items use id prefix "system-" so they can be
 * distinguished from user-created items.
 */

const BRAND_GREEN = '#316049';
const BRAND_SUNFLOWER = '#FDC600';
const BRAND_LIGHT_GREEN = '#4a8c6b';

function makeId(name: string) {
  return `system-${name}`;
}

const BASE_PROPS = {
  fillStyle: 'solid' as const,
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  roughness: 1,
  opacity: 100,
  angle: 0 as unknown as number,
  isDeleted: false,
  groupIds: [] as string[],
  frameId: null,
  index: null,
  boundElements: null,
  updated: 1710000000000,
  link: null,
  locked: false,
  version: 1,
  versionNonce: 1,
};

function seed() {
  return Math.floor(Math.random() * 2000000000);
}

// --- Green Party Branding ---

const greenCard = {
  ...BASE_PROPS,
  id: 'el-green-card',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  strokeColor: BRAND_GREEN,
  backgroundColor: BRAND_GREEN,
  roundness: { type: 3, value: 12 },
  seed: seed(),
};

const sunflowerAccent = {
  ...BASE_PROPS,
  id: 'el-sunflower-accent',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 200,
  height: 8,
  strokeColor: BRAND_SUNFLOWER,
  backgroundColor: BRAND_SUNFLOWER,
  roundness: { type: 3, value: 4 },
  seed: seed(),
};

const greenStickyNote = {
  ...BASE_PROPS,
  id: 'el-sticky-bg',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 160,
  height: 160,
  strokeColor: BRAND_LIGHT_GREEN,
  backgroundColor: '#e8f5e9',
  roundness: { type: 3, value: 8 },
  seed: seed(),
};

const brandHeader = {
  ...BASE_PROPS,
  id: 'el-brand-header',
  type: 'text' as const,
  x: 0,
  y: 0,
  width: 200,
  height: 35,
  strokeColor: BRAND_GREEN,
  backgroundColor: 'transparent',
  text: 'Überschrift',
  fontSize: 28,
  fontFamily: 5,
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
  autoResize: true,
  lineHeight: 1.25,
  seed: seed(),
};

// --- Diagram Templates ---

const flowchartDecision = {
  ...BASE_PROPS,
  id: 'el-flow-diamond',
  type: 'diamond' as const,
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  strokeColor: '#1e1e1e',
  backgroundColor: '#e8f5e9',
  roundness: null,
  seed: seed(),
};

const flowchartProcess = {
  ...BASE_PROPS,
  id: 'el-flow-rect',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 140,
  height: 60,
  strokeColor: '#1e1e1e',
  backgroundColor: '#fff',
  roundness: { type: 3, value: 8 },
  seed: seed(),
};

const flowchartStartEnd = {
  ...BASE_PROPS,
  id: 'el-flow-oval',
  type: 'ellipse' as const,
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  strokeColor: '#1e1e1e',
  backgroundColor: BRAND_SUNFLOWER,
  roundness: null,
  seed: seed(),
};

const orgChartBox = {
  ...BASE_PROPS,
  id: 'el-org-box',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 160,
  height: 70,
  strokeColor: BRAND_GREEN,
  backgroundColor: '#fff',
  roundness: { type: 3, value: 8 },
  strokeWidth: 2,
  seed: seed(),
};

const orgChartLabel = {
  ...BASE_PROPS,
  id: 'el-org-label',
  type: 'text' as const,
  x: 10,
  y: 10,
  width: 140,
  height: 50,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  text: 'Name\nFunktion',
  fontSize: 16,
  fontFamily: 5,
  textAlign: 'center' as const,
  verticalAlign: 'top' as const,
  autoResize: true,
  lineHeight: 1.5,
  seed: seed(),
};

const timelineCircle = {
  ...BASE_PROPS,
  id: 'el-timeline-dot',
  type: 'ellipse' as const,
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  strokeColor: BRAND_GREEN,
  backgroundColor: BRAND_GREEN,
  roundness: null,
  seed: seed(),
};

const timelineLine = {
  ...BASE_PROPS,
  id: 'el-timeline-line',
  type: 'line' as const,
  x: 10,
  y: 20,
  width: 0,
  height: 80,
  strokeColor: BRAND_GREEN,
  backgroundColor: 'transparent',
  points: [
    [0, 0],
    [0, 80],
  ] as [number, number][],
  strokeWidth: 3,
  seed: seed(),
};

const timelineLabel = {
  ...BASE_PROPS,
  id: 'el-timeline-label',
  type: 'text' as const,
  x: 30,
  y: 2,
  width: 100,
  height: 25,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  text: 'Meilenstein',
  fontSize: 16,
  fontFamily: 5,
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
  autoResize: true,
  lineHeight: 1.25,
  seed: seed(),
};

// --- Assemble Library Items ---

const CREATED = 1710000000000;

export const SYSTEM_LIBRARY_ITEMS = [
  // Branding
  {
    id: makeId('green-card'),
    status: 'published' as const,
    name: 'Grüne Karte',
    created: CREATED,
    elements: [greenCard],
  },
  {
    id: makeId('sunflower-accent'),
    status: 'published' as const,
    name: 'Sonnenblumen-Akzent',
    created: CREATED,
    elements: [sunflowerAccent],
  },
  {
    id: makeId('sticky-note'),
    status: 'published' as const,
    name: 'Notizzettel',
    created: CREATED,
    elements: [greenStickyNote],
  },
  {
    id: makeId('brand-header'),
    status: 'published' as const,
    name: 'Überschrift',
    created: CREATED,
    elements: [brandHeader],
  },
  // Diagram Templates
  {
    id: makeId('flowchart-decision'),
    status: 'published' as const,
    name: 'Entscheidung (Raute)',
    created: CREATED,
    elements: [flowchartDecision],
  },
  {
    id: makeId('flowchart-process'),
    status: 'published' as const,
    name: 'Prozessschritt',
    created: CREATED,
    elements: [flowchartProcess],
  },
  {
    id: makeId('flowchart-start-end'),
    status: 'published' as const,
    name: 'Start / Ende',
    created: CREATED,
    elements: [flowchartStartEnd],
  },
  {
    id: makeId('org-chart-node'),
    status: 'published' as const,
    name: 'Organigramm-Knoten',
    created: CREATED,
    elements: [orgChartBox, orgChartLabel],
  },
  {
    id: makeId('timeline-element'),
    status: 'published' as const,
    name: 'Zeitstrahl-Element',
    created: CREATED,
    elements: [timelineCircle, timelineLine, timelineLabel],
  },
];
