"use client";

import { forwardRef } from "react";
import { Button } from "@/components/tiptap-ui-primitive/button";
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button";
import { SparklesIcon } from "@/components/tiptap-icons/sparkles-icon";
import { useAiEditStore } from "@/stores/aiEditStore";
import { useEditorStore } from "@/stores/editorStore";

export interface AiEditorButtonProps extends Omit<ButtonProps, "onClick"> {
  documentId: string;
  onClick?: () => void;
  text?: string;
}

export const AiEditorButton = forwardRef<HTMLButtonElement, AiEditorButtonProps>(
  ({ documentId, onClick, text, ...props }, ref) => {
    const editor = useEditorStore((state) => state.getEditor(documentId));
    const isProcessing = useAiEditStore((state) => state.getIsProcessing(documentId));

    const isDisabled = !editor || !editor.isEditable || isProcessing;

    return (
      <Button
        ref={ref}
        onClick={onClick}
        variant="ghost"
        size="icon"
        aria-label="KI-Bearbeitung"
        title="KI-Bearbeitung (Ctrl+K)"
        disabled={isDisabled}
        {...props}
      >
        <SparklesIcon className={isProcessing ? "animate-pulse" : ""} />
        {text && <span className="ml-2">{text}</span>}
      </Button>
    );
  }
);

AiEditorButton.displayName = "AiEditorButton";
