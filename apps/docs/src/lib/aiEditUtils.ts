import type { Editor } from '@tiptap/react';

interface EditChange {
  text_to_find?: string;
  replacement_text: string;
  full_replace?: boolean;
}

interface TextPosition {
  from: number;
  to: number;
}

export function applyChangesToEditor(
  editor: Editor | null,
  changes: EditChange[]
): { success: boolean; appliedCount: number } {
  if (!editor || !editor.isEditable) {
    return { success: false, appliedCount: 0 };
  }

  let appliedCount = 0;

  try {
    for (const change of changes) {
      // Handle full text replacement
      if (change.full_replace === true) {
        editor.commands.setContent(change.replacement_text);
        appliedCount++;
        continue;
      }

      // Handle partial replacement
      const { text_to_find, replacement_text } = change;
      if (!text_to_find || typeof text_to_find !== 'string') {
        continue;
      }

      // Get plain text for searching
      const plainText = editor.getText();

      // Find all occurrences
      const positions = findTextPositions(plainText, text_to_find);

      if (positions.length === 0) {
        console.warn(`[aiEditUtils] Text not found: "${text_to_find.substring(0, 50)}..."`);
        continue;
      }

      // Apply replacements (reverse order to maintain positions)
      for (let i = positions.length - 1; i >= 0; i--) {
        const { from, to } = positions[i];

        // Convert plain text positions to ProseMirror positions
        const pmFrom = convertTextToPMPosition(editor, from);
        const pmTo = convertTextToPMPosition(editor, to);

        // Apply transaction
        editor
          .chain()
          .focus()
          .setTextSelection({ from: pmFrom, to: pmTo })
          .insertContent(replacement_text)
          .run();

        appliedCount++;
      }
    }

    return { success: appliedCount > 0, appliedCount };
  } catch (error) {
    console.error('[aiEditUtils] Error applying changes:', error);
    return { success: false, appliedCount };
  }
}

function findTextPositions(text: string, search: string): TextPosition[] {
  const positions: TextPosition[] = [];
  let index = 0;

  while ((index = text.indexOf(search, index)) !== -1) {
    positions.push({
      from: index,
      to: index + search.length,
    });
    index += search.length;
  }

  return positions;
}

function convertTextToPMPosition(editor: Editor, textPos: number): number {
  let currentTextPos = 0;
  let pmPos = 1; // Start at 1 (after doc opening tag)

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const nodeTextLength = node.text.length;

      if (currentTextPos + nodeTextLength >= textPos) {
        // Target position is within this text node
        pmPos = pos + (textPos - currentTextPos);
        return false; // Stop iteration
      }

      currentTextPos += nodeTextLength;
    } else if (node.isBlock) {
      // Add 1 for block separators (newlines in plain text)
      currentTextPos += 1;
    }

    return true; // Continue iteration
  });

  return pmPos;
}
