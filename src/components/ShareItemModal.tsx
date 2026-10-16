"use client";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  X,
  Share2,
  Check,
  CheckSquare,
  Square,
  Loader2,
  FolderArchive,
  ArrowRight,
} from "lucide-react";
import ScreenHeader from "@/components/ui/ScreenHeader";
import FormMessage from "@/components/ui/FormMessage";
import {
  getUserApprovedCirclesForItem,
  shareItemToCircles,
  type CircleShareOption,
} from "@/app/sharedrobe/actions";
import type { WardrobeItem } from "@/app/MyDrobeClient";

interface ShareItemModalProps {
  item: WardrobeItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number, itemTitle: string) => void;
}

export default function ShareItemModal({
  item,
  isOpen,
  onClose,
  onSuccess,
}: ShareItemModalProps) {
  const router = useRouter();
  const [circles, setCircles] = useState<CircleShareOption[]>([]);
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load circles when modal opens for an item
  useEffect(() => {
    if (!isOpen || !item) return;

    let isMounted = true;
    getUserApprovedCirclesForItem(item.id).then((res) => {
      if (!isMounted) return;
      setIsLoadingCircles(false);
      if (res.success) {
        setCircles(res.data || []);
      } else {
        setErrorMessage(res.error);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const toggleCircleSelection = (circleId: string, isAlreadyShared: boolean) => {
    if (isAlreadyShared) return; // Cannot toggle already shared circle
    setSelectedCircleIds((prev) =>
      prev.includes(circleId)
        ? prev.filter((id) => id !== circleId)
        : [...prev, circleId]
    );
  };

  const handleShareSubmit = () => {
    if (selectedCircleIds.length === 0) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await shareItemToCircles(selectedCircleIds, item.id);
      if (res.success) {
        onSuccess(res.data?.sharedCount || selectedCircleIds.length, item.title);
        onClose();
      } else {
        setErrorMessage(res.error || "Failed to share garment to selected circles.");
      }
    });
  };

  const newlySelectedCount = selectedCircleIds.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-slate/40 backdrop-blur-xs"
    >
      <div className="relative flex w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-border-neutral bg-buttercream p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <ScreenHeader
          meta="CIRCULATION // SHARE"
          title="Share Garment"
          action={
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-muted hover:text-french-navy transition"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          }
        />

        {/* Item Preview Strip */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border-neutral bg-chalk p-2.5 shadow-2xs">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border-neutral bg-buttercream">
            <Image
              src={item.image_url}
              alt={item.title}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-xs font-bold text-midnight-slate">
              {item.title}
            </h4>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded bg-buttercream px-1.5 py-0.2 font-mono text-[9px] font-bold text-french-navy border border-border-neutral">
                {item.category}
              </span>
              {item.tags && item.tags.length > 0 && (
                <span className="truncate text-[10px] text-muted">
                  #{item.tags.join(" #")}
                </span>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3">
            <FormMessage tone="error">{errorMessage}</FormMessage>
          </div>
        )}

        {/* Circles Checklist Container */}
        <div className="mt-4 flex-1">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              SELECT CIRCLES TO SHARE WITH
            </span>
            {circles.length > 0 && (
              <span className="font-mono text-[10px] text-dusty-lilac">
                {circles.length} Available
              </span>
            )}
          </div>

          {isLoadingCircles ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-dusty-lilac" />
              <span className="mt-2 text-xs font-medium">Loading your circles...</span>
            </div>
          ) : circles.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-xs">
                <FolderArchive className="h-5 w-5" />
              </div>
              <h5 className="mt-2.5 text-xs font-bold text-midnight-slate">
                No circles joined yet
              </h5>
              <p className="mt-1 text-[11px] text-muted max-w-xs">
                You must be an approved member of at least one circle in ShareDrobe before you can share wardrobe items.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/sharedrobe");
                }}
                className="mt-3 inline-flex items-center gap-1 rounded-xl bg-french-navy px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-french-navy-hover transition"
              >
                <span>Go to ShareDrobe</span>
                <ArrowRight size={12} />
              </button>
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1 hide-scrollbar">
              {circles.map((c) => {
                const isSelected = selectedCircleIds.includes(c.id);
                const isAlready = c.isAlreadyShared;

                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isAlready || isPending}
                    onClick={() => toggleCircleSelection(c.id, isAlready)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                      isAlready
                        ? "border-border-neutral/60 bg-chalk/50 cursor-default opacity-80"
                        : isSelected
                        ? "border-french-navy bg-white shadow-xs"
                        : "border-border-neutral bg-chalk hover:border-dusty-lilac/80"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0 text-french-navy">
                        {isAlready ? (
                          <div className="flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-800">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        ) : isSelected ? (
                          <CheckSquare className="h-4 w-4 text-french-navy fill-french-navy/10" />
                        ) : (
                          <Square className="h-4 w-4 text-border-strong" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-midnight-slate truncate">
                            {c.name}
                          </p>
                          {c.role === "admin" && (
                            <span className="font-mono text-[8px] rounded bg-french-navy/10 px-1 font-bold text-french-navy">
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted truncate">
                          {c.memberCount} {c.memberCount === 1 ? "Member" : "Members"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isAlready ? (
                        <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800">
                          Shared
                        </span>
                      ) : isSelected ? (
                        <span className="rounded bg-french-navy px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                          Selected
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="mt-5 flex items-center gap-2 pt-2 border-t border-border-neutral/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold text-muted hover:text-midnight-slate transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || newlySelectedCount === 0}
            onClick={handleShareSubmit}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-french-navy py-2.5 text-xs font-bold text-white shadow-sm hover:bg-french-navy-hover transition disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Sharing...</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>
                  Share {newlySelectedCount > 0 ? `(${newlySelectedCount})` : ""}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
