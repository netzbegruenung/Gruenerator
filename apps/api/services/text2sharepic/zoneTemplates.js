/**
 * Zone Templates for Text2Sharepic
 *
 * Defines layout templates with zones where components can be placed.
 * Each zone has a name, bounds, and component type constraints.
 */

import { CORPORATE_DESIGN } from './componentLibrary.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('Templates');

/**
 * Standard canvas dimensions
 */
const CANVAS_DIMENSIONS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 }
};

/**
 * Zone template registry
 */
const zoneTemplateRegistry = new Map();
const registeredTemplates = [];

/**
 * Register a zone template
 */
function registerTemplate(id, template) {
  zoneTemplateRegistry.set(id, {
    id,
    ...template,
    registeredAt: Date.now()
  });
  registeredTemplates.push(id);
}

/**
 * Get a template by ID
 */
function getTemplate(id) {
  return zoneTemplateRegistry.get(id);
}

/**
 * List all available templates
 */
function listTemplates() {
  return Array.from(zoneTemplateRegistry.entries()).map(([id, template]) => ({
    id,
    name: template.name,
    description: template.description,
    dimensions: template.dimensions,
    category: template.category,
    zones: template.zones.map(z => z.name)
  }));
}

/**
 * Calculate zone bounds based on template dimensions and zone definition
 */
function calculateZoneBounds(zone, dimensions) {
  // Zone positions can be defined as percentages or absolute values
  const parseValue = (value, total) => {
    if (typeof value === 'string' && value.endsWith('%')) {
      return (parseFloat(value) / 100) * total;
    }
    return value;
  };

  return {
    x: parseValue(zone.x, dimensions.width),
    y: parseValue(zone.y, dimensions.height),
    width: parseValue(zone.width, dimensions.width),
    height: parseValue(zone.height, dimensions.height)
  };
}

// =============================================================================
// TEMPLATE: HERO - Full text focus with background
// =============================================================================
registerTemplate('hero', {
  name: 'Hero',
  description: 'Full-width text focus with background, ideal for bold statements',
  category: 'statement',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['statements', 'calls-to-action', 'announcements'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'main-text',
      x: '5%',
      y: '30%',
      width: '90%',
      height: '40%',
      allowedComponents: ['text-headline', 'text-body'],
      required: true
    },
    {
      name: 'subtext',
      x: '5%',
      y: '72%',
      width: '90%',
      height: '15%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: QUOTE - Centered quote with attribution
// =============================================================================
registerTemplate('quote', {
  name: 'Zitat',
  description: 'Centered quote layout with optional attribution',
  category: 'quote',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['quotes', 'testimonials', 'statements'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'quote-text',
      x: '8%',
      y: '25%',
      width: '84%',
      height: '50%',
      allowedComponents: ['text-quote'],
      required: true
    },
    {
      name: 'attribution',
      x: '8%',
      y: '78%',
      width: '84%',
      height: '10%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: QUOTE-PURE - Zitat Pure style (matching zitat_pure_canvas.js)
// =============================================================================
registerTemplate('quote-pure', {
  name: 'Zitat Pure',
  description: 'Clean quote layout matching zitat_pure_canvas.js - italic text with quote marks',
  category: 'quote',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['quotes', 'testimonials', 'statements'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid'],
      required: true
    },
    {
      name: 'quote-content',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['text-quote-pure'],
      required: true
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: HEADER-BALKEN - Single balken header style
// =============================================================================
registerTemplate('header-balken', {
  name: 'Header Balken',
  description: 'Single balken as header - for short headlines or announcements',
  category: 'statement',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['headlines', 'short-statements', 'announcements'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'header',
      x: '5%',
      y: '25%',
      width: '90%',
      height: '15%',
      allowedComponents: ['text-balken'],
      required: true
    },
    {
      name: 'subtext',
      x: '5%',
      y: '45%',
      width: '90%',
      height: '30%',
      allowedComponents: ['text-body', 'text-headline'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: INFO - Header, body, footer structure
// =============================================================================
registerTemplate('info', {
  name: 'Info',
  description: 'Structured information layout with header, body, and footer',
  category: 'information',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['information', 'events', 'facts'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'header',
      x: '5%',
      y: '8%',
      width: '90%',
      height: '15%',
      allowedComponents: ['text-headline'],
      required: true
    },
    {
      name: 'body',
      x: '5%',
      y: '28%',
      width: '90%',
      height: '45%',
      allowedComponents: ['text-body', 'text-headline'],
      required: true
    },
    {
      name: 'footer',
      x: '5%',
      y: '78%',
      width: '90%',
      height: '12%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: SPLIT - Text on one side, visual on other
// =============================================================================
registerTemplate('split-horizontal', {
  name: 'Split Horizontal',
  description: 'Split layout with text on left, visual area on right',
  category: 'mixed',
  dimensions: CANVAS_DIMENSIONS.landscape,
  bestFor: ['comparisons', 'features', 'before-after'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient'],
      required: true
    },
    {
      name: 'left-content',
      x: '5%',
      y: '10%',
      width: '42%',
      height: '80%',
      allowedComponents: ['text-headline', 'text-body', 'text-quote'],
      required: true
    },
    {
      name: 'right-visual',
      x: '52%',
      y: 0,
      width: '48%',
      height: '100%',
      allowedComponents: ['background-image', 'decoration-shape'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: SPLIT VERTICAL - Top visual, bottom text
// =============================================================================
registerTemplate('split-vertical', {
  name: 'Split Vertical',
  description: 'Split layout with visual on top, text below',
  category: 'mixed',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['events', 'announcements', 'news'],
  zones: [
    {
      name: 'top-visual',
      x: 0,
      y: 0,
      width: '100%',
      height: '50%',
      allowedComponents: ['background-image', 'background-gradient'],
      required: true
    },
    {
      name: 'bottom-content',
      x: 0,
      y: '50%',
      width: '100%',
      height: '50%',
      allowedComponents: ['container-card'],
      required: true
    },
    {
      name: 'text-area',
      x: '5%',
      y: '55%',
      width: '90%',
      height: '35%',
      allowedComponents: ['text-headline', 'text-body'],
      required: true
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: THREE-LINE (Dreizeilen) - matches dreizeilen_canvas.js exactly
// =============================================================================
registerTemplate('three-line', {
  name: 'Dreizeilen',
  description: 'Classic three-line slogan layout with Balken (dreizeilen style)',
  category: 'slogan',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['slogans', 'campaigns', 'short-messages'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-image', 'background-solid', 'background-gradient'],
      required: true
    },
    {
      name: 'balken-group',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['text-balken-group'],
      required: true
    },
    {
      name: 'credit',
      x: '5%',
      y: '88%',
      width: '90%',
      height: '8%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: CAMPAIGN - Flexible multi-line with theme support
// =============================================================================
registerTemplate('campaign', {
  name: 'Kampagne',
  description: 'Flexible campaign layout with multiple text lines',
  category: 'campaign',
  dimensions: CANVAS_DIMENSIONS.portrait,
  bestFor: ['campaigns', 'events', 'multi-line-messages'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'text-block',
      x: '5%',
      y: '30%',
      width: '90%',
      height: '50%',
      allowedComponents: ['text-headline', 'text-body'],
      required: true,
      multiLine: true,
      maxLines: 5
    },
    {
      name: 'credit',
      x: '5%',
      y: '82%',
      width: '90%',
      height: '8%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'decorations',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower', 'decoration-bar', 'decoration-shape'],
      required: false
    }
  ]
});

// =============================================================================
// TEMPLATE: STORY - Vertical story format
// =============================================================================
registerTemplate('story', {
  name: 'Story',
  description: 'Vertical story format for Instagram/WhatsApp stories',
  category: 'story',
  dimensions: CANVAS_DIMENSIONS.story,
  bestFor: ['stories', 'vertical-content', 'mobile-first'],
  zones: [
    {
      name: 'background',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['background-solid', 'background-gradient', 'background-image'],
      required: true
    },
    {
      name: 'top-area',
      x: '5%',
      y: '10%',
      width: '90%',
      height: '25%',
      allowedComponents: ['text-headline'],
      required: false
    },
    {
      name: 'center-area',
      x: '5%',
      y: '38%',
      width: '90%',
      height: '30%',
      allowedComponents: ['text-headline', 'text-body', 'text-quote'],
      required: true
    },
    {
      name: 'bottom-area',
      x: '5%',
      y: '72%',
      width: '90%',
      height: '18%',
      allowedComponents: ['text-body'],
      required: false
    },
    {
      name: 'branding',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      allowedComponents: ['decoration-sunflower'],
      required: false
    }
  ]
});

/**
 * Get templates matching a category
 */
function getTemplatesByCategory(category) {
  return Array.from(zoneTemplateRegistry.values())
    .filter(t => t.category === category);
}

/**
 * Get templates best suited for a content type
 */
function getTemplatesForContentType(contentType) {
  return Array.from(zoneTemplateRegistry.values())
    .filter(t => t.bestFor && t.bestFor.includes(contentType));
}

/**
 * Validate that a component can be placed in a zone
 */
function validateComponentPlacement(templateId, zoneName, componentType) {
  const template = getTemplate(templateId);
  if (!template) return { valid: false, error: 'Template not found' };

  const zone = template.zones.find(z => z.name === zoneName);
  if (!zone) return { valid: false, error: 'Zone not found' };

  if (!zone.allowedComponents.includes(componentType)) {
    return {
      valid: false,
      error: `Component '${componentType}' not allowed in zone '${zoneName}'. Allowed: ${zone.allowedComponents.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Get zone bounds for a template
 */
function getZoneBounds(templateId, zoneName) {
  const template = getTemplate(templateId);
  if (!template) return null;

  const zone = template.zones.find(z => z.name === zoneName);
  if (!zone) return null;

  return calculateZoneBounds(zone, template.dimensions);
}

/**
 * Get all zones for a template with calculated bounds
 */
function getTemplateZonesWithBounds(templateId) {
  const template = getTemplate(templateId);
  if (!template) return null;

  return template.zones.map(zone => ({
    ...zone,
    bounds: calculateZoneBounds(zone, template.dimensions)
  }));
}

// Log summary after all templates are registered
if (registeredTemplates.length > 0) {
  log.info(`Registered ${registeredTemplates.length} templates`);
}

export { registerTemplate, getTemplate, listTemplates, getTemplatesByCategory, getTemplatesForContentType, validateComponentPlacement, getZoneBounds, getTemplateZonesWithBounds, calculateZoneBounds, CANVAS_DIMENSIONS };