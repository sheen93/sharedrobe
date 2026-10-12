import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface InfoBarProps {
  icon: LucideIcon;
  label: ReactNode;
  /** Optional right-aligned monospaced detail, e.g. `38 Items Total`. */
  detail?: ReactNode;
  iconClassName?: string;
  className?: string;
}

/** Compact chalk status strip used under screen headers in the Stitch mockup. */
export default function InfoBar({ icon: Icon, label, detail, iconClassName, className }: InfoBarProps) {
  return (
    <div
      className={cn(
        "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border-neutral bg-chalk px-3 py-2",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden className={cn("h-4 w-4 shrink-0 text-dusty-lilac", iconClassName)} />
        <span className="truncate text-xs font-medium text-midnight-slate">{label}</span>
      </div>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-muted">{detail}</span> : null}
    </div>
  );
}
