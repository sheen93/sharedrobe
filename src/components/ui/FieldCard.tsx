import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface FieldCardProps {
  label: string;
  /** id of the control this card labels. */
  htmlFor: string;
  /** Right-aligned label meta, e.g. `Required` / `Verified` (decorative). */
  meta?: string;
  metaClassName?: string;
  helper?: ReactNode;
  helperId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}

/**
 * Chalk field card from the Stitch Profile screen: uppercase label row,
 * control, and helper / error caption underneath.
 */
export default function FieldCard({
  label,
  htmlFor,
  meta,
  metaClassName,
  helper,
  helperId,
  error,
  errorId,
  children,
}: FieldCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-neutral bg-chalk p-4 shadow-sm transition-colors",
        error && "border-red-300"
      )}
    >
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-french-navy"
      >
        <span>{label}</span>
        {meta ? (
          <span aria-hidden className={cn("font-mono text-[10px] text-muted", metaClassName)}>
            {meta}
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[11px] font-semibold text-red-700">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="mt-1.5 text-[11px] text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
