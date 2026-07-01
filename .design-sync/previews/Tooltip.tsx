import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@gruenerator/ui';

const Sparkles = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
  </svg>
);

// Overlay: render open inside a TooltipProvider so the card shows the tooltip
// surface. cfg pins single-mode + viewport so the portalled content renders
// inside the card.
export function FormulierenHinweis() {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="brand" size="sm">
            <Sparkles />
            Neu formulieren
          </Button>
        </TooltipTrigger>
        <TooltipContent>Text mit KI in einen prägnanteren Tonfall umschreiben</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
