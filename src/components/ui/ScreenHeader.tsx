import type { ReactNode } from "react";

interface ScreenHeaderProps {
  /** Uppercase monospaced breadcrumb, e.g. `DIRECTORY // MY_DROBE`. */
  meta: string;
  title: string;
  /** Optional right-aligned slot (action button or badge). */
  action?: ReactNode;
}

/** App screen header matching the Stitch mockup (meta breadcrumb + title). */
export default function ScreenHeader({ meta, title, action }: ScreenHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border-neutral px-2 pt-2 pb-4">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">{meta}</p>
        <h1 className="text-2xl font-bold tracking-tight text-french-navy">{title}</h1>
      </div>
      {action}
    </header>
  );
}
