import {
  type ElementType,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export interface EditableTitleHandle {
  startEdit: () => void;
}

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
  activateOn?: 'click' | 'doubleClick';
}

export const EditableTitle = forwardRef<EditableTitleHandle, EditableTitleProps>(
  function EditableTitle(
    {
      title,
      editable = false,
      onTitleChange,
      className,
      inputClassName,
      editableClassName,
      ariaLabel = 'Titel bearbeiten',
      placeholder = 'Unbenannt',
      as = 'h1',
      activateOn = 'click',
    },
    ref
  ) {
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

    const startEdit = useCallback(() => {
      committedRef.current = false;
      setIsEditing(true);
    }, []);

    useImperativeHandle(ref, () => ({ startEdit }), [startEdit]);

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          className={inputClassName}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          // Stop the input's own pointer events from reaching a parent drag handler
          // (e.g. a dnd-kit kanban card) so text can be selected while editing.
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={ariaLabel}
        />
      );
    }

    const Tag: ElementType = as;
    const idleClassName =
      canEditTitle && editableClassName
        ? `${className ?? ''} ${editableClassName}`.trim()
        : className;

    // In doubleClick mode the title owns its clicks: a single click is swallowed
    // so it never reaches a parent handler (e.g. a card's open-detail onClick),
    // and a double click enters edit mode.
    const activationHandlers = !canEditTitle
      ? {}
      : activateOn === 'doubleClick'
        ? {
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            onDoubleClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              startEdit();
            },
          }
        : { onClick: startEdit };

    return (
      <Tag
        className={idleClassName}
        {...activationHandlers}
        title={
          canEditTitle
            ? activateOn === 'doubleClick'
              ? 'Doppelklicken zum Umbenennen'
              : 'Klicken zum Umbenennen'
            : undefined
        }
      >
        {title || placeholder}
      </Tag>
    );
  }
);
