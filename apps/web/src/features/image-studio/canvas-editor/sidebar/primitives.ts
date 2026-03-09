/**
 * Shared Tailwind class constants for canvas-editor sidebar components.
 * Replaces SidebarPrimitives.css with composable string constants.
 */

export const CARD_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2 w-full max-canvas-mobile:grid-cols-[repeat(auto-fill,minmax(36px,1fr))] max-canvas-mobile:gap-1';

export const CARD_GRID_SINGLE_COL = 'grid grid-cols-1 gap-2 w-full';

export const SELECTABLE_CARD =
  'aspect-square p-1.5 rounded-lg bg-transparent border border-transparent cursor-pointer transition-[background,border-color] duration-150 flex items-center justify-center hover:bg-hover-alt';

export const SELECTABLE_CARD_ACTIVE = 'border-accent bg-background-alt';

export const SELECTABLE_CARD_WITH_LABEL =
  'aspect-square p-1.5 rounded-lg bg-transparent border border-transparent cursor-pointer transition-[background,border-color] duration-150 flex items-center justify-start gap-sm hover:bg-hover-alt';

export const SELECTABLE_CARD_WITH_TEXT =
  'p-sm rounded-lg bg-transparent border border-transparent cursor-pointer transition-[background,border-color] duration-150 flex items-start justify-start gap-sm hover:bg-hover-alt';

export const SECTION_LABEL = 'text-xs font-semibold text-foreground uppercase tracking-wide mb-1';

export const CONTROL_GROUP =
  'bg-[var(--card-background)] border border-[var(--card-border)] rounded-[var(--card-border-radius-small)] p-sm flex flex-col gap-xs';

export const CONTROL_GROUP_HEADER = 'flex items-center gap-xs';

export const CONTROL_GROUP_ICON = 'text-primary-600 shrink-0';

export const CONTROL_GROUP_LABEL =
  'text-[length:var(--font-size-small)] font-semibold text-foreground';

export const SLIDER_ROW = 'flex items-center gap-sm';

export const SLIDER_ROW_WITH_BOUNDS = 'flex items-center gap-xs';

export const SLIDER_BOUND =
  'text-[8px] text-[var(--font-color-secondary)] min-w-[40px] text-center';

export const SLIDER_VALUE =
  'min-w-[48px] text-right text-[length:var(--font-size-small)] text-[var(--font-color-muted)] tabular-nums';

export const SLIDER_VALUE_BADGE =
  'text-center font-medium text-primary-600 bg-background p-[var(--spacing-xxsmall)_var(--spacing-xsmall)] rounded min-w-[50px]';

export const SIDEBAR_HINT =
  'm-0 p-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-[var(--card-border-radius-small)] text-[length:var(--font-size-xs)] text-[var(--font-color-muted)] leading-relaxed text-left';

export const RESET_BTN =
  'flex items-center justify-center gap-xs py-xs px-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-[var(--card-border-radius-small)] text-[var(--font-color-secondary)] text-[length:var(--font-size-small)] cursor-pointer transition-[background-color,border-color,color] duration-150 hover:bg-background-alt hover:border-primary-600 hover:text-primary-600';

export const SIDEBAR_SECTION = 'flex flex-col gap-sm';

export const SIDEBAR_SECTION_FIELD = 'flex flex-col gap-xs';

export const SIDEBAR_SECTION_HINT = 'm-0 text-[0.65rem] text-[var(--font-color-secondary)]';

export const SIDEBAR_SECTION_EMPTY =
  'm-0 p-lg text-center text-[0.7rem] text-[var(--font-color-secondary)]';

export const SECTION_TOGGLE =
  'flex items-center gap-sm w-full bg-transparent border-none cursor-pointer py-sm px-0 text-foreground text-[length:var(--font-size-base)] font-semibold transition-colors duration-200 hover:text-[var(--interactive-accent-color)] [&>svg:last-child]:ml-auto [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200';

export const SECTION_TOGGLE_OPEN = '[&>svg:last-child]:rotate-180';

export const ALTERNATIVES_LIST = 'flex flex-wrap gap-xs py-sm';

export const ALTERNATIVE_ITEM =
  'bg-background-alt border border-[var(--border-color)] rounded-full py-xs px-sm text-[length:var(--font-size-small)] cursor-pointer transition-all duration-200 max-w-full overflow-hidden text-ellipsis whitespace-nowrap hover:bg-hover-alt hover:border-[var(--interactive-accent-color)] hover:text-[var(--interactive-accent-color)]';

export const ALTERNATIVE_ITEM_ACTIVE =
  'border-[var(--interactive-accent-color)] bg-background-alt text-[var(--interactive-accent-color)]';

export const FONT_SIZE_ROW = 'flex items-center gap-md py-sm';

export const FONT_SIZE_BUTTONS = 'flex gap-xs';

export const FONT_SIZE_BTN =
  'w-8 h-8 flex items-center justify-center border border-[var(--border-color)] rounded-full bg-background text-foreground cursor-pointer transition-all duration-200 hover:bg-background-alt hover:border-primary-600 hover:text-primary-600 active:scale-95';

/** Preview container inside a selectable card (centered, 44×44) */
export const CARD_PREVIEW = 'relative size-[44px] flex items-center justify-center shrink-0';

/** Check badge overlaid on a card preview (small, bottom-right) */
export const CARD_CHECK_SMALL =
  'absolute -bottom-[3px] -right-[3px] size-3.5 flex items-center justify-center bg-[var(--interactive-accent-color)] text-background rounded-full';

/** Check badge for list items (normal size, top-right-aligned) */
export const CARD_CHECK =
  'size-[18px] flex items-center justify-center bg-[var(--interactive-accent-color)] text-background rounded-full shrink-0 self-start mt-0.5';

/** Label inside a card with text */
export const CARD_LABEL = 'text-[length:var(--font-size-small)] text-foreground flex-1 text-left';

/** Active state for selectable cards (border highlight) */
export const SELECTABLE_CARD_DISABLED = 'opacity-40 cursor-not-allowed';

/** Section header row (title + action buttons) */
export const SECTION_HEADER = 'flex items-center justify-between px-3 py-1.5';

/** Section title text */
export const SECTION_TITLE =
  'flex-1 text-[11px] font-semibold text-[var(--font-color-secondary)] uppercase tracking-[0.8px]';

/** Small action button (icon-only) for section headers */
export const ACTION_BTN =
  'size-7 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer text-[var(--text-secondary,#666)] transition-[background-color,color] duration-150 hover:bg-[var(--hover-background,#f0f0f0)] hover:text-foreground';

/** Danger variant of action button */
export const ACTION_BTN_DANGER =
  'size-7 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer text-[var(--text-secondary,#666)] transition-[background-color,color] duration-150 hover:bg-red-50 hover:text-red-600';

/** Text action button (inline, small text) */
export const ACTION_BTN_TEXT =
  'ml-auto text-[length:var(--font-size-xs)] text-primary-600 bg-transparent border-none cursor-pointer hover:underline';
