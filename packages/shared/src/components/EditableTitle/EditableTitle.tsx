import { type ElementType, useCallback, useEffect, useRef, useState } from 'react';

interface EditableTitleProps {
  title: string;
  editable?: boolean;
  onTitleChange?: (newTitle: string) => void;
  className?: string;
  inputClassName?: string;
  editableClassName?: string;
  ariaLabel?: string;
  placeholder?: string;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'div';
}

export const EditableTitle = ({
  title,
  editable = false,
  onTitleChange,
  className,
  inputClassName,
  editableClassName,
  ariaLabel = 'Titel bearbeiten',
  placeholder = 'Unbenannt',
  as = 'h1',
}: EditableTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsEditing(false);
    const trimmed = editValue.trim();
    const newTitle = trimmed || placeholder;
    const currentTitle = title || placeholder;
    if (newTitle !== currentTitle) {
      console.log('[title-rename] commitEdit: "%s" → "%s"', currentTitle, newTitle);
      onTitleChange?.(newTitle);
    }
  }, [editValue, title, onTitleChange, placeholder]);

  const cancelEdit = useCallback(() => {
    setEditValue(title);
    setIsEditing(false);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  const canEditTitle = editable && !!onTitleChange;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      />
    );
  }

  const Tag: ElementType = as;
  const idleClassName =
    canEditTitle && editableClassName
      ? `${className ?? ''} ${editableClassName}`.trim()
      : className;

  return (
    <Tag
      className={idleClassName}
      onClick={
        canEditTitle
          ? () => {
              committedRef.current = false;
              setIsEditing(true);
            }
          : undefined
      }
      title={canEditTitle ? 'Klicken zum Umbenennen' : undefined}
    >
      {title || placeholder}
    </Tag>
  );
};
