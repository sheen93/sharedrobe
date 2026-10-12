import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/utils/cn";

/** Base input look from the Stitch mockup (buttercream fill inside chalk cards). */
export const inputBaseClassName =
  "w-full rounded-xl border border-border-strong bg-buttercream py-2.5 pr-10 pl-3.5 text-sm font-semibold text-midnight-slate transition placeholder:font-medium placeholder:text-muted/70 focus:border-french-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-french-navy/15 disabled:cursor-not-allowed disabled:opacity-60 read-only:cursor-default";

interface IconInputProps extends ComponentPropsWithRef<"input"> {
  icon: LucideIcon;
  invalid?: boolean;
}

/** Text input with a trailing lucide icon, as used throughout the Stitch screens. */
export default function IconInput({ icon: Icon, invalid, className, ...props }: IconInputProps) {
  return (
    <div className="relative">
      <input
        {...props}
        aria-invalid={invalid || undefined}
        className={cn(
          inputBaseClassName,
          invalid && "border-red-400 focus:border-red-600 focus-visible:ring-red-600/15",
          className
        )}
      />
      <div className="pointer-events-none absolute top-3 right-3 text-muted">
        <Icon aria-hidden className="h-4 w-4" />
      </div>
    </div>
  );
}
