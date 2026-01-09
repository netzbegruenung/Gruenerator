"use client";

import { useAiEditHistory } from "@/hooks/useAiEditHistory";
import { useEditorStore } from "@/stores/editorStore";
import { Button } from "@/components/tiptap-ui-primitive/button";
import { Badge } from "@/components/tiptap-ui-primitive/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu";
import { Separator } from "@/components/tiptap-ui-primitive/separator";
import {
  Card,
  CardBody,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card";

export interface AiHistoryDropdownProps {
  documentId: string;
}

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="16"
    height="16"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const AiHistoryDropdown = ({ documentId }: AiHistoryDropdownProps) => {
  const editor = useEditorStore((state) => state.getEditor(documentId));
  const { undoAiEdit, redoAiEdit, jumpTo, canUndo, canRedo, history, currentIndex } =
    useAiEditHistory(documentId, editor);

  if (!editor) return null;

  const hasHistory = history.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="KI-Verlauf"
          title="KI-Bearbeitungsverlauf"
          disabled={!hasHistory}
        >
          <ClockIcon />
          {hasHistory && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs"
            >
              {history.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" style={{ minWidth: '16rem' }}>
        <Card>
          <CardBody style={{ padding: '0.25rem' }}>
            <CardItemGroup orientation="vertical" style={{ width: '100%' }}>
              <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
                KI-Bearbeitungsverlauf
              </div>
              <Separator />

              <DropdownMenuItem
                onClick={undoAiEdit}
                disabled={!canUndo}
                style={{ padding: '0.5rem 0.75rem', cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.5 }}
              >
                <span style={{ marginRight: '0.5rem' }}>↩</span>
                Rückgängig (Ctrl+Alt+Z)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={redoAiEdit}
                disabled={!canRedo}
                style={{ padding: '0.5rem 0.75rem', cursor: canRedo ? 'pointer' : 'not-allowed', opacity: canRedo ? 1 : 0.5 }}
              >
                <span style={{ marginRight: '0.5rem' }}>↪</span>
                Wiederholen (Ctrl+Alt+Y)
              </DropdownMenuItem>

              {hasHistory && (
                <>
                  <Separator />
                  <div style={{ maxHeight: '15rem', overflowY: 'auto' }}>
                    {history.map((entry, index) => (
                      <DropdownMenuItem
                        key={entry.id}
                        onClick={() => jumpTo(index)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          backgroundColor: index === currentIndex ? 'var(--tt-gray-light-a-50)' : 'transparent'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500, fontSize: '0.75rem' }}>
                              #{index + 1}
                              {index === currentIndex && " (aktuell)"}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--tt-gray-light-a-600)' }}>
                              {new Date(entry.timestamp).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.instruction}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--tt-gray-light-a-600)' }}>
                            {entry.changes.length} Änderung{entry.changes.length !== 1 ? "en" : ""}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </div>
                </>
              )}
            </CardItemGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
