"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/utils/cn";

type Variant = "primary" | "secondary";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-french-navy text-white shadow-md hover:bg-french-navy-hover",
  secondary:
    "border border-border-neutral bg-chalk text-french-navy shadow-sm hover:border-dusty-lilac",
};

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel: string;
  icon?: LucideIcon;
  variant?: Variant;
  className?: string;
}

/**
 * Full-width Stitch CTA that reflects its parent form's pending state.
 * Must be rendered inside a <form>.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  icon: Icon,
  variant = "primary",
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dusty-lilac focus-visible:ring-offset-2 focus-visible:ring-offset-buttercream active:scale-[0.99] disabled:cursor-wait disabled:opacity-70",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          {Icon ? <Icon aria-hidden className="h-4 w-4" /> : null}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
