import { forwardRef } from 'react';
import { cn } from '../../../utils/tiptap-utils';
import '../input/input.scss';

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return <input ref={ref} type={type} className={cn('tiptap-input', className)} {...props} />;
  }
);
Input.displayName = 'Input';

const InputGroup = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('tiptap-input-group', className)} {...props}>
        {children}
      </div>
    );
  }
);
InputGroup.displayName = 'InputGroup';

export { Input, InputGroup };
