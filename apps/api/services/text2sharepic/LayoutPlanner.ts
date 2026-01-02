/**
 * Layout Planner for Text2Sharepic (TypeScript)
 *
 * AI-powered planner that analyzes user descriptions and generates
 * layout specifications using the component library and zone templates.
 *
 * Architectural Note: This file was moved from agents/sharepic/ to services/text2sharepic/
 * because it contains pure business logic (layout generation algorithms) rather than
 * agent orchestration or decision-making workflows.
 */

import {
  listTemplates,
  getTemplate,
  getTemplateZonesWithBounds,
  getTemplatesForContentType,
} from './zoneTemplates.js';
import { listComponents, getCorporateDesign, CORPORATE_DESIGN } from './componentLibrary.js';
import type {
  IntentCategory,
  Mood,
  FormatType,
  AnalysisResult,
  ColorScheme,
  BackgroundConfig,
  ExtractedContent,
  LayoutPlan,
  ZoneConfig,
  GenerateLayoutOptions,
  LayoutPlannerValidationResult,
  ZoneWithBounds,
  ZoneTemplate,
  ComponentDefinition,
} from './types.js';

// ============================================================================
// Constants and Type Definitions
// ============================================================================

/**
 * Mapping of intent keywords to categories
 */
const INTENT_CATEGORIES: Readonly<Record<IntentCategory, readonly string[]>> = {
  quote: ['zitat', 'quote', 'spruch', 'aussage', 'meinung', 'statement'],
  quotePure: ['zitat pure', 'reines zitat', 'einfaches zitat', 'minimalistisch'],
  slogan: ['slogan', 'dreizeiler', 'drei zeilen', 'kampagne', 'wahlkampf', '3 zeilen', 'dreizeilen'],
  headerBalken: ['balken', 'header balken', 'überschrift balken', 'headline balken', 'ein balken'],
  info: ['info', 'information', 'fakt', 'fact', 'statistik', 'zahlen', 'daten'],
  event: ['event', 'veranstaltung', 'termin', 'einladung', 'datum'],
  announcement: ['ankündigung', 'news', 'nachricht', 'mitteilung', 'neu'],
  story: ['story', 'stories', 'instagram story', 'whatsapp status'],
  statement: [], // Default category
} as const;

/**
 * Color mood mapping type
 */
interface ColorMood {
  primary: string;
  secondary: string;
}

/**
 * Color mood mappings
 */
const COLOR_MOODS: Readonly<Record<Mood, ColorMood>> = {
  serious: { primary: CORPORATE_DESIGN.colors.tanne, secondary: CORPORATE_DESIGN.colors.sand },
  energetic: { primary: CORPORATE_DESIGN.colors.klee, secondary: CORPORATE_DESIGN.colors.grashalm },
  warm: { primary: CORPORATE_DESIGN.colors.sand, secondary: CORPORATE_DESIGN.colors.tanne },
  fresh: { primary: CORPORATE_DESIGN.colors.grashalm, secondary: CORPORATE_DESIGN.colors.white },
  contrast: { primary: CORPORATE_DESIGN.colors.tanne, secondary: CORPORATE_DESIGN.colors.white },
} as const;

// ============================================================================
// Description Analysis
// ============================================================================

/**
 * Analyze user description to extract intent and key information
 */
export function analyzeDescription(description: string): AnalysisResult {
  const lowerDesc = description.toLowerCase();

  // Detect intent category
  let detectedCategory: IntentCategory = 'statement'; // default
  for (const [category, keywords] of Object.entries(INTENT_CATEGORIES)) {
    if (keywords.some((kw) => lowerDesc.includes(kw))) {
      detectedCategory = category as IntentCategory;
      break;
    }
  }

  // Detect mood/tone
  let mood: Mood = 'serious'; // default
  if (lowerDesc.includes('frisch') || lowerDesc.includes('neu') || lowerDesc.includes('jung')) {
    mood = 'fresh';
  } else if (lowerDesc.includes('energie') || lowerDesc.includes('stark') || lowerDesc.includes('power')) {
    mood = 'energetic';
  } else if (lowerDesc.includes('warm') || lowerDesc.includes('herzlich') || lowerDesc.includes('freundlich')) {
    mood = 'warm';
  } else if (lowerDesc.includes('kontrast') || lowerDesc.includes('auffällig') || lowerDesc.includes('bold')) {
    mood = 'contrast';
  }

  // Extract format hints
  let format: FormatType = 'portrait'; // default
  if (lowerDesc.includes('story') || lowerDesc.includes('stories')) {
    format = 'story';
  } else if (lowerDesc.includes('landscape') || lowerDesc.includes('quer') || lowerDesc.includes('banner')) {
    format = 'landscape';
  } else if (lowerDesc.includes('quadrat') || lowerDesc.includes('square')) {
    format = 'square';
  }

  // Check for image background preference
  const wantsImage =
    lowerDesc.includes('bild') ||
    lowerDesc.includes('foto') ||
    lowerDesc.includes('image') ||
    lowerDesc.includes('hintergrund');

  // Check for gradient preference
  const wantsGradient = lowerDesc.includes('gradient') || lowerDesc.includes('verlauf');

  return {
    category: detectedCategory,
    mood,
    format,
    wantsImage,
    wantsGradient,
    originalDescription: description,
  };
}

// ============================================================================
// Template Selection
// ============================================================================

/**
 * Select best template based on analysis
 */
export function selectTemplate(analysis: AnalysisResult): string {
  const templates = listTemplates();

  // Map category to template preferences
  const categoryTemplateMap: Record<IntentCategory, string[]> = {
    quote: ['quote', 'hero'],
    quotePure: ['quote-pure', 'quote'],
    slogan: ['three-line', 'hero'],
    headerBalken: ['header-balken', 'hero'],
    info: ['info', 'split-vertical'],
    event: ['split-vertical', 'info'],
    announcement: ['hero', 'info'],
    story: ['story'],
    statement: ['hero', 'quote'],
  };

  const preferredTemplates = categoryTemplateMap[analysis.category] || ['hero'];

  // Find matching template
  for (const templateId of preferredTemplates) {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      return template.id;
    }
  }

  // Fallback to hero
  return 'hero';
}

// ============================================================================
// Color Scheme Generation
// ============================================================================

/**
 * Generate color scheme based on mood
 */
export function generateColorScheme(mood: Mood, wantsImage: boolean, wantsGradient: boolean): ColorScheme {
  const colors = COLOR_MOODS[mood] || COLOR_MOODS.serious;

  // Determine text color based on background
  const textColorForBackground = (bgColor: string): string => {
    // Light backgrounds need dark text
    if (bgColor === CORPORATE_DESIGN.colors.sand || bgColor === CORPORATE_DESIGN.colors.white) {
      return CORPORATE_DESIGN.colors.tanne;
    }
    return CORPORATE_DESIGN.colors.white;
  };

  if (wantsImage) {
    return {
      background: { type: 'image', overlayColor: colors.primary, overlayOpacity: 0.4 },
      text: CORPORATE_DESIGN.colors.white,
      accent: colors.secondary,
      primary: colors.primary,
      secondary: colors.secondary,
    };
  }

  if (wantsGradient) {
    return {
      background: { type: 'gradient', colorStart: colors.primary, colorEnd: colors.secondary },
      text: textColorForBackground(colors.primary),
      accent: colors.secondary,
      primary: colors.primary,
      secondary: colors.secondary,
    };
  }

  // Default: solid background with mood-based color
  return {
    background: { type: 'solid', color: colors.primary },
    text: textColorForBackground(colors.primary),
    accent: colors.secondary,
    primary: colors.primary,
    secondary: colors.secondary,
  };
}

// ============================================================================
// Zone Configuration Generation
// ============================================================================

/**
 * Generate component configuration for a zone
 */
export function generateZoneConfig(
  zone: ZoneWithBounds,
  analysis: AnalysisResult,
  colorScheme: ColorScheme,
  content: ExtractedContent
): ZoneConfig {
  const config: ZoneConfig = {
    zoneName: zone.name,
    component: undefined,
    params: {},
  };

  const zoneName = zone.name;

  // Background zones
  if (zoneName === 'background' || zoneName === 'top-visual') {
    // For quote-pure, use the zitat background color
    if (analysis.category === 'quotePure' || analysis.category === 'quote') {
      config.component = 'background-solid';
      config.params = {
        color: CORPORATE_DESIGN.colors.zitatBg || '#6ccd87',
      };
      return config;
    }

    if (analysis.wantsImage && zone.allowedComponents.includes('background-image')) {
      config.component = 'background-image';
      config.params = {
        imagePath: '/sharepic_example_bg/default.jpg',
        overlayColor: colorScheme.primary,
        overlayOpacity: 0.4,
      };
    } else if (analysis.wantsGradient && zone.allowedComponents.includes('background-gradient')) {
      config.component = 'background-gradient';
      config.params = {
        colorStart: colorScheme.primary,
        colorEnd: colorScheme.secondary,
        direction: 'vertical',
      };
    } else if (zone.allowedComponents.includes('background-gradient')) {
      // Default to gradient for variety
      config.component = 'background-gradient';
      config.params = {
        colorStart: colorScheme.primary,
        colorEnd: colorScheme.secondary || CORPORATE_DESIGN.colors.klee,
        direction: 'vertical',
      };
    } else {
      config.component = 'background-solid';
      config.params = {
        color: colorScheme.primary || CORPORATE_DESIGN.colors.tanne,
      };
    }
    return config;
  }

  // Main text zones (hero, center areas) - NOT header (handled separately with balken support)
  if (
    zoneName === 'main-text' ||
    zoneName === 'center-area' ||
    zoneName === 'text-area' ||
    zoneName === 'left-content' ||
    zoneName === 'text-block'
  ) {
    if (zone.allowedComponents.includes('text-headline')) {
      config.component = 'text-headline';
      config.params = {
        text: content.headline || content.mainText || content.quote || 'Dein Text hier',
        color: colorScheme.text,
        fontSize: 80,
        font: 'GrueneTypeNeue',
        align: 'center',
      };
    } else if (zone.allowedComponents.includes('text-body')) {
      config.component = 'text-body';
      config.params = {
        text: content.headline || content.mainText || 'Dein Text hier',
        color: colorScheme.text,
        fontSize: 48,
        font: 'GrueneTypeNeue',
        align: 'center',
      };
    }
    return config;
  }

  // Quote-content zone for quote-pure template
  if (zoneName === 'quote-content') {
    if (zone.allowedComponents.includes('text-quote-pure')) {
      config.component = 'text-quote-pure';
      config.params = {
        text: content.quote || content.mainText || content.headline || 'Dein Zitat hier',
        attribution: content.attribution || null,
        textColor: CORPORATE_DESIGN.colors.tanne,
        quoteMarkColor: CORPORATE_DESIGN.colors.tanne,
        quoteFontSize: 78,
        nameFontSize: 35,
      };
    }
    return config;
  }

  // Quote zones
  if (zoneName === 'quote-text' || zoneName.includes('quote')) {
    if (zone.allowedComponents.includes('text-quote')) {
      config.component = 'text-quote';
      config.params = {
        text: content.quote || content.mainText || content.headline || 'Dein Zitat hier',
        attribution: content.attribution || null,
        textColor: colorScheme.text,
        fontSize: 50,
        showQuotationMarks: true,
      };
    } else if (zone.allowedComponents.includes('text-headline')) {
      config.component = 'text-headline';
      config.params = {
        text: content.quote || content.mainText || 'Dein Zitat hier',
        color: colorScheme.text,
        fontSize: 60,
        font: 'GrueneTypeNeue',
        align: 'center',
      };
    }
    return config;
  }

  // Balken-group zone for three-line template (dreizeilen style)
  if (zoneName === 'balken-group') {
    if (zone.allowedComponents.includes('text-balken-group')) {
      // Ensure we have 3 lines of content
      const lines =
        content.lines && content.lines.length > 0
          ? content.lines
          : [content.lines?.[0] || 'Zeile 1', content.lines?.[1] || 'Zeile 2', content.lines?.[2] || 'Zeile 3'];

      config.component = 'text-balken-group';
      config.params = {
        lines: lines.slice(0, 3),
        fontSize: 85,
        font: 'GrueneTypeNeue',
        angle: 12,
        spacing: 0,
        offsetX: [50, -100, 50],
        groupOffsetX: 30,
        groupOffsetY: 80,
        colors: [
          { background: CORPORATE_DESIGN.colors.tanne, text: CORPORATE_DESIGN.colors.sand },
          { background: CORPORATE_DESIGN.colors.sand, text: CORPORATE_DESIGN.colors.tanne },
          { background: CORPORATE_DESIGN.colors.tanne, text: CORPORATE_DESIGN.colors.sand },
        ],
      };
    }
    return config;
  }

  // Header zone with balken support
  if (zoneName === 'header') {
    if (zone.allowedComponents.includes('text-balken')) {
      config.component = 'text-balken';
      config.params = {
        text: content.headline || content.mainText || 'Überschrift',
        backgroundColor: CORPORATE_DESIGN.colors.tanne,
        textColor: CORPORATE_DESIGN.colors.sand,
        fontSize: 85,
        font: 'GrueneTypeNeue',
        angle: 12,
        paddingFactor: 0.3,
        heightFactor: 1.6,
        align: 'center',
        offsetX: 0,
      };
    } else if (zone.allowedComponents.includes('text-headline')) {
      config.component = 'text-headline';
      config.params = {
        text: content.headline || content.mainText || 'Dein Text hier',
        color: colorScheme.text,
        fontSize: 80,
        font: 'GrueneTypeNeue',
        align: 'center',
      };
    }
    return config;
  }

  // Three-line zones (legacy support) - use text-balken for the Grüne style
  if (zoneName === 'line1' || zoneName === 'line2' || zoneName === 'line3') {
    const lineIndex = parseInt(zoneName.replace('line', '')) - 1;
    const lineText = content.lines?.[lineIndex] || `Zeile ${lineIndex + 1}`;

    // Use text-balken component for proper dreizeilen style
    config.component = 'text-balken';
    config.params = {
      text: lineText,
      backgroundColor:
        lineIndex % 2 === 0 ? CORPORATE_DESIGN.colors.tanne : CORPORATE_DESIGN.colors.sand,
      textColor:
        lineIndex % 2 === 0 ? CORPORATE_DESIGN.colors.sand : CORPORATE_DESIGN.colors.tanne,
      fontSize: 85,
      font: 'GrueneTypeNeue',
      angle: 12,
      paddingFactor: 0.3,
      heightFactor: 1.6,
      align: 'center',
      offsetX: [50, -100, 50][lineIndex] || 0,
    };
    return config;
  }

  // Top/bottom areas for story format
  if (zoneName === 'top-area') {
    if (zone.allowedComponents.includes('text-headline')) {
      config.component = 'text-headline';
      config.params = {
        text: content.headline || content.mainText || '',
        color: colorScheme.text,
        fontSize: 70,
        font: 'GrueneTypeNeue',
        align: 'center',
      };
    }
    return config;
  }

  if (zoneName === 'bottom-area') {
    if (zone.allowedComponents.includes('text-body')) {
      config.component = 'text-body';
      config.params = {
        text: content.subText || content.body || '',
        color: colorScheme.text,
        fontSize: 36,
        font: 'PTSans-Regular',
        align: 'center',
      };
    }
    return config;
  }

  // Body/subtext/footer zones
  if (zoneName === 'body' || zoneName === 'subtext' || zoneName === 'footer') {
    if (zone.allowedComponents.includes('text-body')) {
      config.component = 'text-body';
      config.params = {
        text: content.body || content.subText || '',
        color: colorScheme.text,
        fontSize: 36,
        font: 'PTSans-Regular',
        align: 'center',
      };
    }
    return config;
  }

  // Attribution zone
  if (zoneName === 'attribution') {
    if (zone.allowedComponents.includes('text-body') && content.attribution) {
      config.component = 'text-body';
      config.params = {
        text: `— ${content.attribution}`,
        color: colorScheme.text,
        fontSize: 30,
        font: 'PTSans-Regular',
        align: 'center',
      };
    }
    return config;
  }

  // Credit zone
  if (zoneName === 'credit') {
    if (zone.allowedComponents.includes('text-body')) {
      config.component = 'text-body';
      config.params = {
        text: content.credit || '',
        color: colorScheme.text,
        fontSize: 28,
        font: 'PTSans-Regular',
        align: 'center',
      };
    }
    return config;
  }

  // Container zones (bottom-content, etc.)
  if (zoneName === 'bottom-content') {
    if (zone.allowedComponents.includes('container-card')) {
      config.component = 'container-card';
      config.params = {
        backgroundColor: colorScheme.primary,
        opacity: 1,
        padding: 40,
        borderRadius: 0,
      };
    }
    return config;
  }

  // Visual zones (right-visual)
  if (zoneName === 'right-visual') {
    if (zone.allowedComponents.includes('background-image')) {
      config.component = 'background-image';
      config.params = {
        imagePath: '/sharepic_example_bg/default.jpg',
        overlayColor: colorScheme.primary,
        overlayOpacity: 0.2,
      };
    } else if (zone.allowedComponents.includes('decoration-shape')) {
      config.component = 'decoration-shape';
      config.params = {
        shape: 'circle',
        color: colorScheme.secondary,
        size: 300,
        opacity: 0.3,
        x: 50,
        y: 100,
      };
    }
    return config;
  }

  // Branding/decoration zones
  if (zoneName === 'branding' || zoneName === 'decorations') {
    if (zone.allowedComponents.includes('decoration-sunflower')) {
      config.component = 'decoration-sunflower';
      config.params = {
        opacity: 0.06,
      };
    }
    return config;
  }

  return config;
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extract content from description based on category
 */
export function extractContentFromDescription(description: string, category: IntentCategory): ExtractedContent {
  const content: ExtractedContent = {
    mainText: '',
    headline: '',
    body: '',
    subText: '',
    quote: '',
    attribution: '',
    lines: [],
    credit: '',
  };

  // Try to extract quoted text (both " and „ quotes)
  const quotedMatch = description.match(/["„]([^"„"]+)["„"]/);
  if (quotedMatch) {
    const quotedText = quotedMatch[1].trim();
    if (category === 'quote') {
      content.quote = quotedText;
    } else {
      content.mainText = quotedText;
      content.headline = quotedText;
    }
  }

  // Try to extract text after various label patterns
  const labelPatterns = [
    /(?:text|inhalt|content):\s*(.+?)(?:\.|$)/i,
    /(?:titel|title|headline|überschrift):\s*(.+?)(?:\.|$)/i,
    /(?:message|nachricht|botschaft):\s*(.+?)(?:\.|$)/i,
  ];

  for (const pattern of labelPatterns) {
    const match = description.match(pattern);
    if (match && !content.mainText) {
      content.mainText = match[1].trim();
      content.headline = match[1].trim();
      break;
    }
  }

  // Extract text after colon if there's a clear structure (e.g., "Thema: Klimaschutz")
  if (!content.mainText && !content.quote) {
    const colonMatch = description.match(/:\s*([A-ZÄÖÜ][^.!?]+)/);
    if (colonMatch) {
      content.mainText = colonMatch[1].trim();
      content.headline = colonMatch[1].trim();
    }
  }

  // Try to extract attribution (von, by, —, –, -)
  const attributionMatch = description.match(/(?:von|by|—|–|-)\\s*([A-ZÄÖÜ][A-Za-zäöüÄÖÜß\\s]+?)(?:\\.|,|$)/);
  if (attributionMatch) {
    content.attribution = attributionMatch[1].trim();
  }

  // Extract line content for three-line templates
  const linePatterns = [
    /zeile\s*1[:\s]+(.+?)(?:zeile|$)/i,
    /zeile\s*2[:\s]+(.+?)(?:zeile|$)/i,
    /zeile\s*3[:\s]+(.+?)(?:zeile|$)/i,
  ];

  for (let i = 0; i < linePatterns.length; i++) {
    const match = description.match(linePatterns[i]);
    if (match) {
      content.lines[i] = match[1].trim().replace(/,\s*$/, '');
    }
  }

  // Extract body text if there's "Text:" followed by something different than title
  const bodyMatch = description.match(/text:\s*(.+?)(?:\.|$)/i);
  if (bodyMatch && content.headline && bodyMatch[1].trim() !== content.headline) {
    content.body = bodyMatch[1].trim();
  }

  // Extract event-specific content
  if (category === 'event') {
    const dateMatch = description.match(
      /(\d{1,2}\.\s*(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|\d{1,2})\\.?\s*(?:\d{4})?)/i
    );
    const timeMatch = description.match(/(\d{1,2}(?::\d{2})?\s*uhr)/i);
    const locationMatch = description.match(/(?:im|in|bei|ort:)\s*([A-ZÄÖÜ][^,.\n]+)/i);

    if (dateMatch || timeMatch || locationMatch) {
      const eventDetails: string[] = [];
      if (dateMatch) eventDetails.push(dateMatch[1]);
      if (timeMatch) eventDetails.push(timeMatch[1]);
      if (locationMatch) eventDetails.push(locationMatch[1].trim());
      content.subText = eventDetails.join(' • ');
    }
  }

  // If still no content found, try to extract any meaningful phrase
  if (!content.mainText && !content.quote) {
    // Look for any capitalized phrase that could be a title
    const phraseMatch = description.match(
      /(?:erstelle|mache|generiere)[^:]*?(?:für|zum|über|mit)?\s*[:\s]*([A-ZÄÖÜ][^.!?\n]{10,})/i
    );
    if (phraseMatch) {
      content.mainText = phraseMatch[1].trim();
      content.headline = phraseMatch[1].trim();
    }
  }

  // Final fallback: use placeholder
  if (!content.mainText && !content.quote) {
    content.mainText = 'Dein Text hier';
    content.headline = 'Dein Text hier';
  }

  return content;
}

// ============================================================================
// Layout Plan Generation
// ============================================================================

/**
 * Generate a complete layout plan from description
 * This is the main entry point for the layout planner
 */
export async function generateLayoutPlan(
  description: string,
  options: GenerateLayoutOptions = {}
): Promise<LayoutPlan> {
  console.log('[LayoutPlanner] Generating layout plan for:', description.substring(0, 100));

  // Step 1: Analyze the description
  const analysis = analyzeDescription(description);
  console.log('[LayoutPlanner] Analysis:', analysis);

  // Step 2: Select template
  const templateId = options.templateId || selectTemplate(analysis);
  const template = getTemplate(templateId);
  console.log('[LayoutPlanner] Selected template:', templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Step 3: Generate color scheme
  const colorScheme = generateColorScheme(analysis.mood, analysis.wantsImage, analysis.wantsGradient);

  // Step 4: Get zones with bounds
  const zones = getTemplateZonesWithBounds(templateId);

  // Step 5: Extract content from description (basic extraction)
  const content = extractContentFromDescription(description, analysis.category);

  // Step 6: Generate zone configurations
  const zoneConfigs = zones.map((zone) => generateZoneConfig(zone, analysis, colorScheme, content));

  // Build the layout plan
  const layoutPlan: LayoutPlan = {
    templateId,
    dimensions: template.dimensions,
    analysis,
    colorScheme,
    content,
    zones: zoneConfigs.filter((z) => z.component !== undefined),
    metadata: {
      generatedAt: Date.now(),
      description: description.substring(0, 200),
      category: analysis.category,
    },
  };

  console.log('[LayoutPlanner] Generated plan with', layoutPlan.zones.length, 'zones');

  return layoutPlan;
}

// ============================================================================
// AI-Powered Layout Generation
// ============================================================================

/**
 * Claude API Helper interface (minimal typing for optional dependency)
 */
interface ClaudeApiHelper {
  callClaude(params: {
    systemPrompt: string;
    userMessage: string;
    options?: {
      temperature?: number;
      maxTokens?: number;
    };
  }): Promise<{ content: string }>;
}

/**
 * Build the AI prompt for layout planning
 */
function buildLayoutPrompt(description: string, templates: any[], components: any[]): string {
  return `Du bist ein Layout-Planer für Sharepics. Analysiere die Beschreibung und erstelle einen Layout-Plan.

BESCHREIBUNG:
${description}

VERFÜGBARE TEMPLATES:
${templates.map((t) => `- ${t.id}: ${t.description} (Zonen: ${t.zones.join(', ')})`).join('\n')}

VERFÜGBARE KOMPONENTEN:
${components.map((c) => `- ${c.type}: ${c.description}`).join('\n')}

CORPORATE DESIGN FARBEN:
- Tanne (Dunkelgrün): ${CORPORATE_DESIGN.colors.tanne}
- Klee (Grün): ${CORPORATE_DESIGN.colors.klee}
- Grashalm (Hellgrün): ${CORPORATE_DESIGN.colors.grashalm}
- Sand (Beige): ${CORPORATE_DESIGN.colors.sand}
- Weiß: ${CORPORATE_DESIGN.colors.white}

Erstelle einen JSON Layout-Plan mit:
1. templateId: Das beste Template für diese Beschreibung
2. zones: Array mit Konfiguration für jede Zone
3. colorScheme: Farbschema basierend auf dem Inhalt
4. content: Extrahierter Text-Inhalt

Antworte NUR mit validem JSON.`;
}

/**
 * Parse AI response to layout plan
 */
function parseAIResponse(response: string): any | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('[LayoutPlanner] Failed to parse AI response:', error);
    return null;
  }
}

/**
 * Generate layout plan using AI (Claude)
 * This is an advanced version that uses the AI worker
 */
export async function generateLayoutPlanWithAI(
  description: string,
  claudeApiHelper: ClaudeApiHelper,
  options: GenerateLayoutOptions = {}
): Promise<LayoutPlan> {
  console.log('[LayoutPlanner] Generating AI-powered layout plan');

  const templates = listTemplates();
  const components = listComponents();

  const prompt = buildLayoutPrompt(description, templates, components);

  try {
    // Call Claude API through the worker
    const response = await claudeApiHelper.callClaude({
      systemPrompt:
        'Du bist ein Experte für visuelles Design und Sharepic-Erstellung. Antworte immer mit validem JSON.',
      userMessage: prompt,
      options: {
        temperature: 0.7,
        maxTokens: 2000,
      },
    });

    const aiPlan = parseAIResponse(response.content);

    if (aiPlan) {
      // Merge AI plan with our structure
      return {
        ...aiPlan,
        metadata: {
          generatedAt: Date.now(),
          aiGenerated: true,
          description: description.substring(0, 200),
          category: aiPlan.analysis?.category || 'statement',
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LayoutPlanner] AI generation failed, falling back to rule-based:', errorMessage);
  }

  // Fallback to rule-based generation
  return generateLayoutPlan(description, options);
}

// ============================================================================
// Layout Plan Validation
// ============================================================================

/**
 * Validate a layout plan
 */
export function validateLayoutPlan(plan: LayoutPlan): LayoutPlannerValidationResult {
  const errors: string[] = [];

  if (!plan.templateId) {
    errors.push('Missing templateId');
  }

  if (!plan.zones || !Array.isArray(plan.zones)) {
    errors.push('Missing or invalid zones array');
  }

  if (!plan.dimensions) {
    errors.push('Missing dimensions');
  }

  // Check required zones
  const template = getTemplate(plan.templateId);
  if (template) {
    const requiredZones = template.zones.filter((z: any) => z.required).map((z: any) => z.name);
    const providedZones = plan.zones.map((z) => z.zoneName);

    for (const required of requiredZones) {
      if (!providedZones.includes(required)) {
        errors.push(`Missing required zone: ${required}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { INTENT_CATEGORIES, COLOR_MOODS };
