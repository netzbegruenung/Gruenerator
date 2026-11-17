// Moved to @ggraphic/schema (ggraphic plan, phase 1 step 5); kept so existing imports resolve.
export {
  LIST_BULLET,
  hasListMarkers,
  isOrderedMarker,
  layoutRichTextBlock,
  layoutTextBlock,
  normalizeListMarkers,
  splitListItems,
  stripLeadingBullets,
  wrapLines,
} from '@ggraphic/schema';
export type {
  LayoutedLine,
  ListItem,
  MeasureRun,
  MeasureText,
  PositionedRun,
  RichLayoutedLine,
} from '@ggraphic/schema';
