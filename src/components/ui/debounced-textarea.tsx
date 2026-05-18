import * as React from "react";
import { Textarea, type TextareaProps } from "./textarea";

interface DebouncedTextareaProps extends Omit<TextareaProps, "onChange"> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  debounceMs?: number;
}

/**
 * Textarea com estado local para feedback instantâneo de digitação.
 * Sincroniza com o pai via debounce (default 500ms).
 *
 * IMPORTANTE: memoizado com comparador customizado que ignora a identidade
 * de `onChange` (capturado por ref). Isso evita que re-renders do pai
 * disparados por qualquer outra mudança causem re-render deste componente.
 */
const InternalDebouncedTextarea = React.forwardRef<HTMLTextAreaElement, DebouncedTextareaProps>(
  ({ value, onChange, debounceMs = 500, onBlur, ...props }, ref) => {
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
      } as React.ChangeEvent<HTMLTextAreaElement>;
      onChangeRef.current(fakeEvent);
    }, []);

    // Sincroniza apenas quando o valor do pai mudou externamente (ex.: reset, load).
    // Se há digitação local pendente, não sobrescreve com prop antiga: isso causava
    // rollback visual/stutter quando o formulário pai re-renderizava antes do debounce.
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
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        emitChange(localValue, e.target.name);
        lastPropValue.current = localValue;
      }
      onBlur?.(e);
    }, [emitChange, localValue, onBlur]);

    React.useEffect(() => {
      return () => {
        if (timerRef.current) {
          // flush pendente ao desmontar
          emitChange(lastPropValue.current ?? "", undefined);
          clearTimeout(timerRef.current);
        }
      };
    }, [emitChange]);

    return <Textarea ref={ref} {...props} value={localValue} onChange={handleChange} onBlur={handleBlur} />;
  },
);

InternalDebouncedTextarea.displayName = "DebouncedTextarea";

// Comparador customizado: ignora identidade de onChange (capturado via ref interna).
// Re-renderiza apenas se o valor controlado, layout ou estado visual mudarem.
const arePropsEqual = (prev: DebouncedTextareaProps, next: DebouncedTextareaProps) => {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.placeholder === next.placeholder &&
    prev.className === next.className &&
    prev.rows === next.rows &&
    prev.name === next.name &&
    prev.readOnly === next.readOnly &&
    prev.debounceMs === next.debounceMs &&
    prev.required === next.required
  );
};

const DebouncedTextarea = React.memo(InternalDebouncedTextarea, arePropsEqual) as typeof InternalDebouncedTextarea;

export { DebouncedTextarea };
