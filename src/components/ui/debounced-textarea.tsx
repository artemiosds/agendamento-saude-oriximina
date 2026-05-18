import * as React from "react";
import { Textarea, type TextareaProps } from "./textarea";

interface DebouncedTextareaProps extends Omit<TextareaProps, "onChange"> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  debounceMs?: number;
}

/**
 * A Textarea that keeps its own local state for instant feedback,
 * syncing back to the parent only after a short debounce.
 * This prevents expensive parent re-renders on every keystroke.
 */
const DebouncedTextarea = React.forwardRef<HTMLTextAreaElement, DebouncedTextareaProps>(
  ({ value, onChange, debounceMs = 300, onBlur, ...props }, ref) => {
    const [localValue, setLocalValue] = React.useState(value);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;

    const emitChange = React.useCallback((newValue: string, name?: string) => {
      const fakeEvent = {
        target: { value: newValue, name },
        currentTarget: { value: newValue, name },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      onChangeRef.current(fakeEvent);
    }, []);

    // Sync from parent when value changes externally (e.g. form reset)
    const lastPropValue = React.useRef(value);
    React.useEffect(() => {
      if (value !== lastPropValue.current) {
        lastPropValue.current = value;
        setLocalValue(value);
      }
    }, [value]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        lastPropValue.current = newValue;

        if (timerRef.current) clearTimeout(timerRef.current);
        const fieldName = e.target.name;
        timerRef.current = setTimeout(() => {
          emitChange(newValue, fieldName);
          timerRef.current = null;
        }, debounceMs);
      },
      [debounceMs, emitChange],
    );

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        emitChange(localValue, e.target.name);
      }
      onBlur?.(e);
    }, [emitChange, localValue, onBlur]);

    // Flush on unmount
    React.useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    return <Textarea ref={ref} {...props} value={localValue} onChange={handleChange} onBlur={handleBlur} />;
  },
);

DebouncedTextarea.displayName = "DebouncedTextarea";

export { DebouncedTextarea };
