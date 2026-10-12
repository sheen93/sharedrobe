"use client";

import React from "react";
import { Share2, Plus, Sparkles, FolderArchive, ChevronRight } from "lucide-react";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";
import BottomNav from "@/components/BottomNav";

const PREVIEW_CIRCLES = [
  {
    name: "College Roommates",
    members: "4 Members • Maya, Emma, Zoe & You",
    count: "24 items",
    active: true,
  },
  {
    name: "Weekend Gala Circle",
    members: "6 Members • Formal dresses & coats",
    count: "18 items",
    active: false,
  },
  {
    name: "Brooklyn Fashion Swap",
    members: "12 Members • Local neighborhood",
    count: "41 items",
    active: false,
  },
  {
    name: "Work Besties Collective",
    members: "3 Members • Office wear & blazers",
    count: "15 items",
    active: false,
  },
];

export default function ShareDrobePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen p-4 pb-24 sm:p-6">
      {/* Dev / Screen indicator matching Stitch reference */}
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span className="rounded bg-dusty-lilac px-2 py-0.5 text-[10px] text-white">
          SCREEN 2
        </span>
        <span>Community Drobe Hub</span>
      </div>

      {/* Mobile Shell */}
      <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] border border-border-neutral bg-buttercream p-5 shadow-2xl">
        {/* Screen Header matching Stitch Screen 2 */}
        <ScreenHeader
          meta="CIRCULATION // SHARED"
          title="ShareDrobe"
          action={
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-dusty-lilac text-white shadow-md transition active:scale-95"
              title="Add Options (Coming Soon)"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </button>
          }
        />

        {/* Info strip */}
        <InfoBar
          icon={Share2}
          label="Connected Sharing Circles"
          detail="Coming Soon"
          iconClassName="text-french-navy"
          className="mt-3"
        />

        {/* Feature Announcement / Coming Soon Card */}
        <div className="mt-4 rounded-2xl border border-dusty-lilac/30 bg-dusty-lilac/10 p-4 text-french-navy">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-dusty-lilac text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Circles In Development
              </h3>
              <p className="text-[11px] text-muted">
                Feature Milestone: Phase 2
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-midnight-slate">
            Share closets with friends, roommates, and style circles. Borrow and lend garments friction-free directly through circular wardrobe directories.
          </p>
        </div>

        {/* Preview Circles from Stitch mockup */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              PREVIEW DIRECTORIES
            </span>
            <span className="font-mono text-[10px] text-dusty-lilac">
              4 Mock Circles
            </span>
          </div>

          {PREVIEW_CIRCLES.map((circle) => (
            <div
              key={circle.name}
              className="group flex items-center justify-between rounded-2xl border border-border-neutral bg-chalk p-3.5 shadow-xs transition hover:border-dusty-lilac"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-buttercream text-french-navy transition group-hover:bg-french-navy group-hover:text-white">
                  <FolderArchive className="h-5 w-5 fill-current/20" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-midnight-slate">
                      {circle.name}
                    </h4>
                    {circle.active && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        title="Active circle"
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-muted">{circle.members}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-border-neutral bg-buttercream px-2 py-0.5 font-mono text-[11px] font-medium text-french-navy">
                  {circle.count}
                </span>
                <ChevronRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Persistent Bottom Nav with ShareDrobe active */}
      <BottomNav />
    </div>
  );
}
