import * as React from "react";
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
    const lastPropValue = React.useRef(value);

    const emitChange = React.useCallback((newValue: string, name?: string) => {
      const fakeEvent = {
        target: { value: newValue, name },
        currentTarget: { value: newValue, name },
      } as React.ChangeEvent<HTMLInputElement>;
      onChangeRef.current(fakeEvent);
    }, []);

    React.useEffect(() => {
      if (value !== lastPropValue.current) {
        lastPropValue.current = value;
        setLocalValue(value ?? "");
      }
    }, [value]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        emitChange(localValue, e.target.name);
      }
      onBlur?.(e);
    }, [emitChange, localValue, onBlur]);

    React.useEffect(() => {
      return () => {
        if (timerRef.current) {
          emitChange(lastPropValue.current ?? "", undefined);
          clearTimeout(timerRef.current);
        }
      };
    }, [emitChange]);

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
