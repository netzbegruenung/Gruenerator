/**
 * The Grünerator's own host services: the Vorlagen behind the „Vorlagen" tab,
 * the blocks of the Elemente panel and the print Vorlagen composer. Only the
 * Grünerator UI reads them (`VorlagenSection`, `blockInsert`), so the editor
 * core does not declare them; this file adds them to `CanvasEditorServices`
 * and `CanvasPrintService` by interface augmentation.
 *
 * Every module that reads or supplies these members imports from here, and so
 * does the package barrel, so the augmentation is in every program that sees
 * them.
 */
import type { BlockSlide, LiftedBlock } from '@ggraphic/editor/blocks/liftedBlock';
import type { CanvasPrintService } from '@ggraphic/editor/hostServices';
import type {
  CanvasVorlage,
  FolienVorlage,
  PrintSpec,
  PrintVorlage,
  SharepicBlock,
  SharepicBrand,
  SharepicColor,
  SharepicCreatorLocale,
  SharepicFormat,
  SharepicSeite,
} from '@gruenerator/contracts';

/** The print service with the Grünerator's members (`composePrint`) on it. */
export type { CanvasPrintService };

/** A page a Vorlage composes to, ready for `replaceDeck`. */
export interface VorlagePage {
  configId: string;
  state: Record<string, unknown>;
}

/**
 * The host's pages behind the „Vorlagen" tab of a sharepic, each Vorlage
 * slide among them. `composeSeite` turns one into a page (needs the browser:
 * fonts, photo tones) and keeps its spec on it, so the chat can go on editing it.
 */
export interface CanvasVorlagenService {
  /** The Seiten in one design; the tab asks for the one the sharepic is in. */
  listSeiten: (brand: SharepicBrand) => Promise<SharepicSeite[]>;
  composeSeite: (seite: SharepicSeite, format: SharepicFormat) => Promise<VorlagePage[]>;
  /** Vorlagen saved as finished pages, for every format; the tab shows the document's. */
  listCanvas?: () => Promise<CanvasVorlage[]>;
  /** The slide deck Vorlagen (Stile) of the viewer's country, for „Vorlage für alle Folien". */
  loadDeckVorlagen?: () => Promise<FolienVorlage[]>;
  /** The print Vorlagen of the viewer's country; their specs compose through `print.composePrint`. */
  listPrint?: () => Promise<PrintVorlage[]>;
  /**
   * Copies a print Vorlage into a new design of the viewer's own and opens it;
   * without this the tab only replaces the design.
   */
  openPrintAsNew?: (vorlage: PrintVorlage) => void;
  /** The host's blocks for the viewer, for the Elemente panel. */
  listBloecke?: (brand: SharepicBrand) => Promise<SharepicBlock[]>;
  /** Composes a block on `color` in `format` (needs the browser: fonts); the slide holds it alone. */
  composeBlock?: (
    block: SharepicBlock,
    options: { format: SharepicFormat; color: SharepicColor }
  ) => Promise<BlockSlide>;
}

/**
 * Turns a block the host composed (`CanvasVorlagenService.composeBlock`) into
 * items for a page. The editor places the result (`placeBlock`) and selects
 * its parts.
 *
 * Without it the editor offers no blocks: no „Blöcke" category in the
 * Elemente panel and no block drop onto a page, as without a block catalogue.
 */
export interface CanvasBlockService {
  /** The colour to compose a block on for a page with this background. */
  ground: (
    locale: SharepicCreatorLocale,
    page: { backgroundMode?: unknown; backgroundColor?: unknown },
    fallback: SharepicColor,
    brand?: SharepicBrand
  ) => SharepicColor;
  /** The elements of `items` cut loose from the composed slide, ids made unique by `token`. */
  lift: (slide: BlockSlide, items: readonly number[], token: string) => LiftedBlock;
}

declare module '@ggraphic/editor/CanvasEditorProvider' {
  interface CanvasEditorHostServices {
    /** The host's Vorlagen for the „Vorlagen" tab; when omitted, the tab is hidden. */
    vorlagen?: CanvasVorlagenService;

    /**
     * Turns composed blocks into page items (`CanvasBlockService`). When
     * omitted, the editor offers no blocks, even with `vorlagen.listBloecke`
     * and `vorlagen.composeBlock`.
     */
    blocks?: CanvasBlockService;
  }
}

declare module '@ggraphic/editor/hostServices' {
  interface CanvasPrintService {
    /**
     * The pages of a print Vorlage's spec (measures text: fonts must be ready).
     * Without a print service the „Vorlagen" tab lists no print Vorlagen.
     */
    composePrint: (spec: PrintSpec) => {
      templateType: string;
      slides: readonly Record<string, unknown>[];
    };
  }
}
