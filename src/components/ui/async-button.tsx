import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AsyncButton — drop-in replacement for <Button> that gives immediate visual
 * feedback (disabled + spinner) the instant it is clicked, before the async
 * handler resolves. It also debounces double-clicks. Zero business-logic
 * changes: it just wraps onClick.
 *
 * Usage:
 *   <AsyncButton onClick={async () => { await save(); }}>Salvar</AsyncButton>
 *
 * If `onClick` is synchronous or returns void, the button behaves like a
 * normal Button — no visual difference. If it returns a Promise, the button
 * disables itself and shows a spinner until the promise settles.
 */
export interface AsyncButtonProps extends Omit<ButtonProps, "onClick"> {
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<unknown>;
  /** Optional custom label shown while loading (defaults to children). */
  loadingLabel?: React.ReactNode;
  /** Force loading state from outside (e.g. driven by react-query mutation). */
  loading?: boolean;
  /** Minimum time in ms between successive clicks. Default 300 ms. */
  debounceMs?: number;
}

export const AsyncButton = React.forwardRef<
  HTMLButtonElement,
  AsyncButtonProps
>(function AsyncButton(
  {
    onClick,
    loading: loadingProp,
    loadingLabel,
    debounceMs = 300,
    disabled,
    children,
    className,
    ...rest
  },
  ref,
) {
  const [internalLoading, setInternalLoading] = React.useState(false);
  const lastClickRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loading = loadingProp ?? internalLoading;
  const isDisabled = disabled || loading;

  const handleClick = React.useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      const now = Date.now();
      if (now - lastClickRef.current < debounceMs) return;
      lastClickRef.current = now;

      if (!onClick) return;
      let result: void | Promise<unknown>;
      try {
        result = onClick(e);
      } catch (err) {
        // Synchronous throw — nothing to await, rethrow for caller boundaries.
        throw err;
      }
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setInternalLoading(true);
        try {
          await result;
        } finally {
          if (mountedRef.current) setInternalLoading(false);
        }
      }
    },
    [onClick, isDisabled, debounceMs],
  );

  return (
    <Button
      ref={ref}
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(className)}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
});

export default AsyncButton;
