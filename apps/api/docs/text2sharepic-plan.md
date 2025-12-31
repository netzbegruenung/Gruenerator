# Text2Sharepic - AI-Powered Implementation Plan

## Overview

Replace the rule-based layout planner with Claude AI that receives component/template presets, generates both creative text AND structured JSON layout, which the existing composer renders.

## Current State

### Existing Infrastructure
- **Component Library** (`services/text2sharepic/componentLibrary.js`): 13 reusable components
- **Zone Templates** (`services/text2sharepic/zoneTemplates.js`): 10 layout templates
- **Layout Planner** (`agents/sharepic/layoutPlanner.js`): Rule-based keyword matching
- **Sharepic Composer** (`services/text2sharepic/sharepicComposer.js`): Orchestrates rendering
- **API Routes** (`routes/sharepic/text2sharepic.js`): REST endpoints

### Available Components
| Component | Category | Description |
|-----------|----------|-------------|
| `background-solid` | background | Solid color fill |
| `background-gradient` | background | Linear gradient (vertical/horizontal/diagonal) |
| `background-image` | background | Image with optional overlay |
| `text-headline` | text | Large headline text |
| `text-body` | text | Body text with wrapping |
| `text-quote` | text | Quote with attribution |
| `text-quote-pure` | text | Zitat Pure style (matches zitat_pure_canvas.js) |
| `text-balken` | text | Single parallelogram bar (12° angle) |
| `text-balken-group` | text | 3-line dreizeilen style |
| `decoration-sunflower` | decoration | Party logo |
| `decoration-bar` | decoration | Colored bar |
| `decoration-shape` | decoration | Circle/rectangle shapes |
| `container-card` | container | Card with background |

### Available Templates
| Template | Category | Dimensions | Best For |
|----------|----------|------------|----------|
| `hero` | statement | 1080x1350 | Bold statements |
| `quote` | quote | 1080x1350 | General quotes |
| `quote-pure` | quote | 1080x1350 | Zitat Pure style |
| `header-balken` | statement | 1080x1350 | Single balken header |
| `three-line` | slogan | 1080x1350 | Dreizeilen campaigns |
| `info` | information | 1080x1350 | Facts, data |
| `split-horizontal` | mixed | 1200x630 | Comparisons |
| `split-vertical` | mixed | 1080x1350 | Events, news |
| `campaign` | campaign | 1080x1350 | Multi-line messages |
| `story` | story | 1080x1920 | Instagram/WhatsApp stories |

### Corporate Design Colors
```javascript
{
  tanne: '#005538',      // Dark green (primary)
  klee: '#008939',       // Green
  grashalm: '#8ABD24',   // Light green
  sand: '#F5F1E9',       // Beige/cream
  white: '#FFFFFF',
  zitatBg: '#6ccd87'     // Quote background
}
```

---

## Architecture

```
User: "Mach ein Sharepic über Klimaschutz"
              ↓
┌─────────────────────────────────────────┐
│  AI Sharepic Generator (NEW)            │
│  - Receives: component schemas,         │
│    templates, colors, constraints       │
│  - Claude API via existing aiWorker     │
│  - Generates: text content + JSON layout│
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  JSON Validator (NEW)                   │
│  - Validates against component schemas  │
│  - Ensures colors from allowed palette  │
│  - Clamps values to valid ranges        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  SharepicComposer (EXISTING)            │
│  - Renders validated JSON to canvas     │
└─────────────────────────────────────────┘
              ↓
           PNG Image
```

---

## Implementation

### Phase 1: Create AI Prompt Configuration

**File:** `prompts/sharepic/text2sharepic.json`

```json
{
  "systemRole": "Du bist ein Sharepic-Designer für Bündnis 90/Die Grünen. Du erstellst kreative, politische Texte UND das passende Layout als JSON. Halte dich strikt an die Corporate Design Vorgaben.",
  "options": {
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

### Phase 2: Create AI Context Builder

**File:** `services/text2sharepic/aiLayoutGenerator.js`

```javascript
const { listTemplates } = require('./zoneTemplates');
const { listComponents, CORPORATE_DESIGN } = require('./componentLibrary');

function buildSystemPrompt() {
  const templates = listTemplates();
  const components = listComponents();

  return `
Du bist ein Sharepic-Designer für Bündnis 90/Die Grünen.

VERFÜGBARE TEMPLATES:
${templates.map(t => `- ${t.id}: ${t.description} (${t.dimensions.width}x${t.dimensions.height})`).join('\n')}

VERFÜGBARE KOMPONENTEN:
${components.map(c => `- ${c.type}: ${c.description}`).join('\n')}

FARB-PALETTE (NUR DIESE VERWENDEN):
- tanne: #005538 (Dunkelgrün, seriös)
- klee: #008939 (Grün, energisch)
- grashalm: #8ABD24 (Hellgrün, frisch)
- sand: #F5F1E9 (Beige, warm)
- zitatBg: #6ccd87 (Zitat-Hintergrund)

CONSTRAINTS:
- fontSize: min 30, max 120
- Balken angle: immer 12°
- Sunflower: immer bottomRight
- Text max 200 Zeichen pro Feld

OUTPUT FORMAT (NUR JSON):
{
  "generatedText": {
    "headline": "...",
    "lines": ["...", "...", "..."],
    "quote": "...",
    "attribution": "..."
  },
  "layout": {
    "templateId": "template-name",
    "zones": [
      {
        "zoneName": "background",
        "component": "component-type",
        "params": { ... }
      }
    ]
  }
}
`;
}

async function generateLayout(description, claudeHelper) {
  const systemPrompt = buildSystemPrompt();

  const response = await claudeHelper.callClaude({
    systemPrompt,
    userMessage: `Erstelle ein Sharepic: ${description}`,
    options: { temperature: 0.7, maxTokens: 2000 }
  });

  return parseResponse(response.content);
}

function parseResponse(content) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

module.exports = { buildSystemPrompt, generateLayout };
```

### Phase 3: Create JSON Validator

**File:** `services/text2sharepic/layoutValidator.js`

```javascript
const { getComponent, CORPORATE_DESIGN } = require('./componentLibrary');
const { getTemplate } = require('./zoneTemplates');

const ALLOWED_COLORS = Object.values(CORPORATE_DESIGN.colors);

function validateLayout(layout) {
  const errors = [];
  const warnings = [];

  // Validate template exists
  const template = getTemplate(layout.templateId);
  if (!template) {
    errors.push(`Unknown template: ${layout.templateId}`);
    return { valid: false, errors, warnings, corrected: null };
  }

  // Validate and correct each zone
  const correctedZones = layout.zones.map(zone => {
    const component = getComponent(zone.component);
    if (!component) {
      warnings.push(`Unknown component: ${zone.component}, skipping`);
      return null;
    }

    const correctedParams = { ...zone.params };

    // Validate colors
    for (const [key, value] of Object.entries(correctedParams)) {
      if (key.toLowerCase().includes('color') && !ALLOWED_COLORS.includes(value)) {
        warnings.push(`Invalid color ${value}, using tanne`);
        correctedParams[key] = CORPORATE_DESIGN.colors.tanne;
      }
    }

    // Clamp numeric values
    if (correctedParams.fontSize) {
      correctedParams.fontSize = Math.max(30, Math.min(120, correctedParams.fontSize));
    }

    return { ...zone, params: correctedParams };
  }).filter(Boolean);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    corrected: { ...layout, zones: correctedZones }
  };
}

module.exports = { validateLayout };
```

### Phase 4: Update Sharepic Composer

**File:** `services/text2sharepic/sharepicComposer.js` (add method)

```javascript
async generateFromAI(description, claudeHelper, options = {}) {
  try {
    // Generate layout with AI
    const aiLayout = await aiLayoutGenerator.generateLayout(description, claudeHelper);

    // Validate and correct
    const validation = layoutValidator.validateLayout(aiLayout.layout);

    if (!validation.valid) {
      console.warn('[SharepicComposer] AI layout validation failed:', validation.errors);
      // Fallback to rule-based
      return this.generateFromDescription(description, options);
    }

    if (validation.warnings.length > 0) {
      console.warn('[SharepicComposer] AI layout warnings:', validation.warnings);
    }

    // Render the corrected layout
    return this.renderLayoutPlan({
      ...validation.corrected,
      content: aiLayout.generatedText
    });

  } catch (error) {
    console.error('[SharepicComposer] AI generation failed:', error.message);
    // Fallback to rule-based
    return this.generateFromDescription(description, options);
  }
}
```

### Phase 5: Update API Route

**File:** `routes/sharepic/text2sharepic.js` (add endpoint)

```javascript
router.post('/generate-ai', async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description required' });
    }

    const claudeHelper = require('../../utils/claudeApiHelper');
    const result = await composer.generateFromAI(description, claudeHelper);

    res.json({
      success: true,
      image: result.image,
      width: result.width,
      height: result.height,
      aiGenerated: true
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Example Flow

### Input
```
"Erstelle ein Sharepic zum Thema Energiewende"
```

### AI Output
```json
{
  "generatedText": {
    "headline": "Energiewende jetzt!",
    "lines": ["Saubere Energie", "Sichere Zukunft", "Für alle!"]
  },
  "layout": {
    "templateId": "three-line",
    "zones": [
      {
        "zoneName": "background",
        "component": "background-gradient",
        "params": {
          "colorStart": "#008939",
          "colorEnd": "#8ABD24",
          "direction": "vertical"
        }
      },
      {
        "zoneName": "balken-group",
        "component": "text-balken-group",
        "params": {
          "lines": ["Saubere Energie", "Sichere Zukunft", "Für alle!"],
          "fontSize": 85,
          "offsetX": [50, -100, 50]
        }
      },
      {
        "zoneName": "branding",
        "component": "decoration-sunflower",
        "params": {
          "position": "bottomRight",
          "size": 150
        }
      }
    ]
  }
}
```

### Result
PNG image with dreizeilen layout, AI-generated text, corporate design colors.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `prompts/sharepic/text2sharepic.json` | CREATE | AI prompt configuration |
| `services/text2sharepic/aiLayoutGenerator.js` | CREATE | Build AI context, call Claude |
| `services/text2sharepic/layoutValidator.js` | CREATE | Validate AI output |
| `services/text2sharepic/sharepicComposer.js` | MODIFY | Add `generateFromAI()` |
| `routes/sharepic/text2sharepic.js` | MODIFY | Add `/generate-ai` endpoint |
| `tests/text2sharepic-ai.test.js` | CREATE | Test AI generation |

---

## Fallback Strategy

If AI generation fails at any point:
1. Log the error
2. Fall back to rule-based `generateFromDescription()`
3. Return result with `aiGenerated: false` flag

This ensures the feature always works, even if Claude API is unavailable.
