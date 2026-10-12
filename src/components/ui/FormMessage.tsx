import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface FormMessageProps {
  tone: "error" | "success";
  children: ReactNode;
  className?: string;
}

/** Inline form-level banner. Errors are announced assertively, success politely. */
export default function FormMessage({ tone, children, className }: FormMessageProps) {
  const isError = tone === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium",
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-dusty-lilac/40 bg-dusty-lilac/10 text-french-navy",
        className
      )}
    >
      <Icon aria-hidden className={cn("mt-px h-4 w-4 shrink-0", !isError && "text-dusty-lilac")} />
      <span>{children}</span>
    </div>
  );
}
