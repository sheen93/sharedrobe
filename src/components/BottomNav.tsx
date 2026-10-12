"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shirt, Users, User } from "lucide-react";
import { cn } from "@/utils/cn";

interface BottomNavProps {
  className?: string;
}

export default function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();

  const isMyDrobe = pathname === "/";
  const isProfile = pathname.startsWith("/profile");
  const isShareDrobe = pathname.startsWith("/sharedrobe");

  return (
    <nav
      aria-label="Main Navigation"
      className={cn(
        "fixed bottom-3 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-french-navy px-6 py-2.5 text-white shadow-xl",
        className
      )}
    >
      {/* Nav 1: MyDrobe */}
      <Link
        href="/"
        className={cn(
          "flex flex-col items-center gap-0.5 transition",
          isMyDrobe
            ? "text-dusty-lilac"
            : "text-border-neutral/70 hover:text-white"
        )}
      >
        <div
          className={cn(
            "flex h-6 w-9 items-center justify-center rounded-lg",
            isMyDrobe && "bg-white/10"
          )}
        >
          <Shirt className="h-4 w-4 stroke-[2.5]" />
        </div>
        <span
          className={cn(
            "text-[10px] tracking-tight",
            isMyDrobe ? "font-bold" : "font-medium"
          )}
        >
          MyDrobe
        </span>
      </Link>

      {/* Nav 2: ShareDrobe */}
      <Link
        href="/sharedrobe"
        className={cn(
          "flex flex-col items-center gap-0.5 transition",
          isShareDrobe
            ? "text-dusty-lilac"
            : "text-border-neutral/70 hover:text-white"
        )}
      >
        <div
          className={cn(
            "flex h-6 w-9 items-center justify-center rounded-lg",
            isShareDrobe && "bg-white/10"
          )}
        >
          <Users className="h-4 w-4 stroke-[2.5]" />
        </div>
        <span
          className={cn(
            "text-[10px] tracking-tight",
            isShareDrobe ? "font-bold" : "font-medium"
          )}
        >
          ShareDrobe
        </span>
      </Link>

      {/* Nav 3: Profile */}
      <Link
        href="/profile"
        className={cn(
          "flex flex-col items-center gap-0.5 transition",
          isProfile
            ? "text-dusty-lilac"
            : "text-border-neutral/70 hover:text-white"
        )}
      >
        <div
          className={cn(
            "flex h-6 w-9 items-center justify-center rounded-lg",
            isProfile && "bg-white/10"
          )}
        >
          <User className="h-4 w-4 stroke-[2.5]" />
        </div>
        <span
          className={cn(
            "text-[10px] tracking-tight",
            isProfile ? "font-bold" : "font-medium"
          )}
        >
          Profile
        </span>
      </Link>
    </nav>
  );
}
