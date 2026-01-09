"use client";

import { useState, type FormEvent } from "react";
import { useAiEdit } from "@/hooks/useAiEdit";
import { useAiEditStore } from "@/stores/aiEditStore";
import { useEditorStore } from "@/stores/editorStore";
import { AiEditorButton } from "@/components/tiptap-ui/ai-editor-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover";
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button";
import { Input, InputGroup } from "@/components/tiptap-ui-primitive/input";
import {
  Card,
  CardBody,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card";

export interface AiEditorPopoverProps {
  documentId: string;
}

export const AiEditorPopover = ({ documentId }: AiEditorPopoverProps) => {
  const editor = useEditorStore((state) => state.getEditor(documentId));
  const [isOpen, setIsOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const { applyAiEdit, isProcessing } = useAiEdit(documentId, editor);
  const { addChatMessage } = useAiEditStore();

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    if (!instruction.trim() || isProcessing) return;

    const userInstruction = instruction.trim();

    // Add user message to chat
    addChatMessage(documentId, {
      role: "user",
      content: userInstruction,
    });

    // Apply AI edit
    const result = await applyAiEdit(userInstruction);

    // Add AI response to chat
    addChatMessage(documentId, {
      role: "assistant",
      content: result.success ? result.summary! : result.error!,
      type: result.success ? "success" : "error",
    });

    if (result.success) {
      setInstruction("");
      setIsOpen(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInstruction(action);
    // Auto-submit after quick action
    setTimeout(() => {
      handleSubmit();
    }, 100);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <PopoverTrigger asChild>
        <AiEditorButton documentId={documentId} />
      </PopoverTrigger>
      <PopoverContent align="start" style={{ minWidth: '320px' }}>
        <Card>
          <CardBody>
            <CardItemGroup orientation="vertical" style={{ gap: '0.75rem', width: '100%' }}>
              <div>
                <h4 style={{ fontWeight: 500, marginBottom: '0.5rem' }}>KI-Bearbeitung</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--tt-gray-light-a-600)', marginBottom: '0.75rem' }}>
                  Beschreibe, wie der Text geändert werden soll
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                <InputGroup>
                  <Input
                    placeholder="z.B. 'kürzen' oder 'formeller machen'..."
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    autoFocus
                    disabled={isProcessing}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                </InputGroup>

                <CardItemGroup orientation="horizontal" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={() => handleQuickAction("Kürzen")}
                    disabled={isProcessing}
                  >
                    Kürzen
                  </Button>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={() => handleQuickAction("Professioneller")}
                    disabled={isProcessing}
                  >
                    Professioneller
                  </Button>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={() => handleQuickAction("Einfacher")}
                    disabled={isProcessing}
                  >
                    Einfacher
                  </Button>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={() => handleQuickAction("Rechtschreibung korrigieren")}
                    disabled={isProcessing}
                  >
                    Korrektur
                  </Button>
                </CardItemGroup>

                <Button
                  type="submit"
                  disabled={!instruction.trim() || isProcessing}
                  data-style="primary"
                  style={{ width: '100%' }}
                >
                  {isProcessing ? "Verarbeite..." : "Anwenden"}
                </Button>
              </form>
            </CardItemGroup>
          </CardBody>
        </Card>
      </PopoverContent>
    </Popover>
  );
};
