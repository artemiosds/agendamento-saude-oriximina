import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  /**
   * Async (or sync) action invoked on click. Button is auto-disabled and shows
   * a spinner while the returned promise is pending. Prevents double-submits.
   */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown | Promise<unknown>;
  /** Optional label shown next to spinner while loading. Defaults to children. */
  loadingText?: React.ReactNode;
  /** Hide spinner (use when caller already shows their own). */
  hideSpinner?: boolean;
}

/**
 * Drop-in replacement for <Button> that gives instant visual feedback
 * (spinner + disabled) for async handlers, preventing double-clicks.
 *
 * Behavior matches <Button> exactly otherwise — same variants/sizes/styles.
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ onClick, children, disabled, loadingText, hideSpinner, className, ...rest }, ref) => {
    const [busy, setBusy] = React.useState(false);
    const mountedRef = React.useRef(true);
    React.useEffect(() => () => { mountedRef.current = false; }, []);

    const handle = React.useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (busy || disabled) return;
        if (!onClick) return;
        let result: unknown;
        try {
          setBusy(true);
          result = onClick(e);
        } catch {
          setBusy(false);
          return;
        }
        if (result && typeof (result as Promise<unknown>).then === "function") {
          try {
            await result;
          } catch {
            /* swallowed — caller toasts */
          } finally {
            if (mountedRef.current) setBusy(false);
          }
        } else {
          setBusy(false);
        }
      },
      [onClick, busy, disabled],
    );

    return (
      <Button
        ref={ref}
        type={rest.type ?? "button"}
        disabled={disabled || busy}
        onClick={handle}
        className={cn(className)}
        {...rest}
      >
        {busy && !hideSpinner && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy && loadingText ? loadingText : children}
      </Button>
    );
  },
);
ActionButton.displayName = "ActionButton";

export default ActionButton;
