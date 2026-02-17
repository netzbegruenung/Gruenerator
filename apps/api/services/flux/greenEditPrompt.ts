/**
 * Green Edit Prompt Builder
 *
 * Builds structured FLUX image-to-image prompts for green urban transformation.
 * Detects German keywords to selectively add urban greening elements.
 *
 * Shared between the ChatGraph imageEditNode and the DeepAgent edit_image tool.
 */

export function buildGreenEditPrompt(userText: string): string {
  const trimmed = (userText || '').toString().trim();
  const hasUserInput = trimmed.length > 0;
  const lowerInput = trimmed.toLowerCase();

  const editDescription = hasUserInput
    ? `Apply green urban transformation: ${trimmed}`
    : 'Transform into an ecological, green, pleasant urban space';

  const greenElements: string[] = [];
  if (
    !hasUserInput ||
    lowerInput.includes('baum') ||
    lowerInput.includes('bäume') ||
    lowerInput.includes('tree')
  ) {
    greenElements.push('Native street trees in permeable strips, 6-10m spacing');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('pflanz') ||
    lowerInput.includes('blume') ||
    lowerInput.includes('grün') ||
    lowerInput.includes('plant') ||
    lowerInput.includes('flower')
  ) {
    greenElements.push('Native perennials, pollinator-friendly flowers');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('fahrrad') ||
    lowerInput.includes('bike') ||
    lowerInput.includes('rad') ||
    lowerInput.includes('cycle')
  ) {
    greenElements.push('Protected bike lanes with green paint, 1.6-2.0m width');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('gehweg') ||
    lowerInput.includes('fußgänger') ||
    lowerInput.includes('pedestrian') ||
    lowerInput.includes('sidewalk')
  ) {
    greenElements.push('Wider sidewalks, raised crosswalks');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('bank') ||
    lowerInput.includes('sitz') ||
    lowerInput.includes('bench') ||
    lowerInput.includes('seat')
  ) {
    greenElements.push('Comfortable benches with backrests near shade');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('straßenbahn') ||
    lowerInput.includes('tram') ||
    lowerInput.includes('bahn')
  ) {
    greenElements.push('Modern tram line with grass tracks');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('bus') ||
    lowerInput.includes('haltestelle') ||
    lowerInput.includes('stop')
  ) {
    greenElements.push('Modern bus stop with green roof shelter');
  }

  const promptStructure = {
    scene: 'Street-level urban photograph',
    edit: editDescription,
    add: greenElements,
    style: 'Photorealistic urban planning visualization',
    constraints: {
      preserve: [
        'original architecture',
        'facades',
        'skyline',
        'street layout',
        'camera angle',
        'lighting',
      ],
      maintain: ['existing people', 'vehicles', 'storefronts', 'signage text'],
    },
    quality: 'Photorealistic, true-to-scale, no artifacts or fantasy elements',
  };

  return JSON.stringify(promptStructure, null, 2);
}
