import * as React from "react";
import { flushSync } from "react-dom";
import { Input } from "./input";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

interface DebouncedInputProps extends Omit<InputProps, "onChange"> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  debounceMs?: number;
}

/**
 * Input com estado local para digitação instantânea e flush via debounce.
 * Memoizado: ignora identidade de onChange (capturado por ref) para evitar
 * re-renders em cascata vindos do pai.
 */
const InternalDebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  ({ value, onChange, debounceMs = 400, onBlur, ...props }, ref) => {
    const [localValue, setLocalValue] = React.useState(value ?? "");
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;
    const lastPropValue = React.useRef(value ?? "");
    const dirtyRef = React.useRef(false);

    const emitChange = React.useCallback((newValue: string, name?: string) => {
      const fakeEvent = {
        target: { value: newValue, name },
        currentTarget: { value: newValue, name },
      } as React.ChangeEvent<HTMLInputElement>;
      onChangeRef.current(fakeEvent);
    }, []);

    React.useEffect(() => {
      const nextValue = value ?? "";
      if (dirtyRef.current) {
        if (nextValue === localValue) {
          dirtyRef.current = false;
          lastPropValue.current = nextValue;
        }
        return;
      }
      if (nextValue !== lastPropValue.current) {
        lastPropValue.current = nextValue;
        setLocalValue(nextValue);
      }
    }, [value, localValue]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        dirtyRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        const fieldName = e.target.name;
        timerRef.current = setTimeout(() => {
          React.startTransition(() => emitChange(newValue, fieldName));
          lastPropValue.current = newValue;
          timerRef.current = null;
        }, debounceMs);
      },
      [debounceMs, emitChange],
    );

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        flushSync(() => emitChange(localValue, e.target.name));
        lastPropValue.current = localValue;
        dirtyRef.current = false;
      }
      onBlur?.(e);
    }, [emitChange, localValue, onBlur]);

    React.useEffect(() => {
      return () => {
        if (timerRef.current) {
          emitChange(localValue ?? "", undefined);
          clearTimeout(timerRef.current);
        }
      };
    }, [emitChange, localValue]);

    return <Input ref={ref} {...props} value={localValue} onChange={handleChange} onBlur={handleBlur} />;
  },
);

InternalDebouncedInput.displayName = "DebouncedInput";

const arePropsEqual = (prev: DebouncedInputProps, next: DebouncedInputProps) => {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.placeholder === next.placeholder &&
    prev.className === next.className &&
    prev.type === next.type &&
    prev.name === next.name &&
    prev.readOnly === next.readOnly &&
    prev.debounceMs === next.debounceMs &&
    prev.required === next.required
  );
};

const DebouncedInput = React.memo(InternalDebouncedInput, arePropsEqual) as typeof InternalDebouncedInput;

export { DebouncedInput };
