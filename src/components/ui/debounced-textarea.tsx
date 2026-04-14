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
  ({ value, onChange, debounceMs = 150, ...props }, ref) => {
    const [localValue, setLocalValue] = React.useState(value);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;

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
        // Keep a reference to the synthetic event's target value
        const syntheticTarget = e.target;
        timerRef.current = setTimeout(() => {
          // Create a minimal synthetic-like event for the parent
          const fakeEvent = {
            target: { value: newValue, name: syntheticTarget.name },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          onChangeRef.current(fakeEvent);
        }, debounceMs);
      },
      [debounceMs],
    );

    // Flush on unmount
    React.useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    return <Textarea ref={ref} {...props} value={localValue} onChange={handleChange} />;
  },
);

DebouncedTextarea.displayName = "DebouncedTextarea";

export { DebouncedTextarea };
