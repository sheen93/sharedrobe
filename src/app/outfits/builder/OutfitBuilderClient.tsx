"use client";

import { useState, useMemo, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Sparkles,
  Shirt,
  Users,
  Lock,
  Globe,
  Plus,
  X,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Layers,
  Eye,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  createOutfit,
  toggleOutfitVisibility,
  deleteOutfit,
} from "@/app/outfits/actions";
import {
  MAX_OUTFIT_ITEMS,
  type OutfitVisibility,
} from "@/app/outfits/constants";
import { cn } from "@/utils/cn";

export interface BuilderGarmentItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  image_url: string;
  owner_id: string;
  ownerName: string;
  status: string;
  circleId?: string | null;
  circleName?: string | null;
}

export interface BuilderCircleOption {
  id: string;
  name: string;
  description: string | null;
}

export interface SavedOutfitSummary {
  id: string;
  title: string;
  visibility: OutfitVisibility;
  circleId: string | null;
  circleName: string | null;
  createdAt: string;
  items: BuilderGarmentItem[];
  yayCount: number;
  nayCount: number;
}

interface OutfitBuilderClientProps {
  currentUserId: string;
  myClosetItems: BuilderGarmentItem[];
  circleClosetItems: BuilderGarmentItem[];
  circles: BuilderCircleOption[];
  savedOutfits: SavedOutfitSummary[];
  initialCircleId?: string | null;
  backHref?: string;
}

const CATEGORIES = [
  "All",
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Bags",
  "Accessories",
] as const;

export default function OutfitBuilderClient({
  currentUserId,
  myClosetItems,
  circleClosetItems,
  circles,
  savedOutfits,
  initialCircleId = null,
  backHref = "/",
}: OutfitBuilderClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab state: 'my_closet' vs 'circle_closets'
  const [activeClosetTab, setActiveClosetTab] = useState<
    "my_closet" | "circle_closets"
  >("my_closet");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedCircleFilter, setSelectedCircleFilter] =
    useState<string>("all");

  // Selected items on the Outfit Canvas (ordered array of item IDs)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Save Outfit Modal state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [outfitTitle, setOutfitTitle] = useState("");
  const [visibilityMode, setVisibilityMode] = useState<OutfitVisibility>(
    initialCircleId ? "circle_public" : "private"
  );
  const [targetCircleId, setTargetCircleId] = useState<string>(
    initialCircleId && circles.some((c) => c.id === initialCircleId)
      ? initialCircleId
      : circles[0]?.id ?? ""
  );

  // Feedback state
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Build unified lookup map of all items by ID
  const itemLookupMap = useMemo(() => {
    const map = new Map<string, BuilderGarmentItem>();
    for (const item of myClosetItems) {
      map.set(item.id, item);
    }
    for (const item of circleClosetItems) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [myClosetItems, circleClosetItems]);

  const selectedItems = useMemo(() => {
    return selectedItemIds
      .map((id) => itemLookupMap.get(id))
      .filter((item): item is BuilderGarmentItem => Boolean(item));
  }, [selectedItemIds, itemLookupMap]);

  const borrowedCountOnCanvas = useMemo(
    () =>
      selectedItems.filter((item) => item.owner_id !== currentUserId).length,
    [selectedItems, currentUserId]
  );

  // Filtered items for the active selector tab
  const displayedSelectorItems = useMemo(() => {
    const sourceList =
      activeClosetTab === "my_closet" ? myClosetItems : circleClosetItems;

    return sourceList.filter((item) => {
      if (
        activeClosetTab === "circle_closets" &&
        selectedCircleFilter !== "all" &&
        item.circleId !== selectedCircleFilter
      ) {
        return false;
      }

      if (activeCategory === "All") return true;
      const itemCat = (item.category || "").toLowerCase().trim();
      const activeCat = activeCategory.toLowerCase().trim();
      return (
        itemCat === activeCat ||
        itemCat.replace(/s$/, "") === activeCat.replace(/s$/, "")
      );
    });
  }, [
    activeClosetTab,
    myClosetItems,
    circleClosetItems,
    selectedCircleFilter,
    activeCategory,
  ]);

  const handleToggleCanvasItem = (item: BuilderGarmentItem) => {
    setFeedback(null);
    setSelectedItemIds((prev) => {
      if (prev.includes(item.id)) {
        return prev.filter((id) => id !== item.id);
      }
      if (prev.length >= MAX_OUTFIT_ITEMS) {
        setFeedback({
          type: "error",
          text: `You can add up to ${MAX_OUTFIT_ITEMS} pieces per lookbook.`,
        });
        return prev;
      }
      // If adding a circle item and targetCircleId isn't set yet, prefill with that item's circle
      if (item.circleId && !targetCircleId) {
        setTargetCircleId(item.circleId);
      }
      return [...prev, item.id];
    });
  };

  const handleOpenSaveModal = () => {
    if (selectedItemIds.length === 0) {
      setFeedback({
        type: "error",
        text: "Tap at least 1 garment below to add it to your Outfit Canvas first!",
      });
      return;
    }
    setModalError(null);
    setIsSaveModalOpen(true);
  };

  const handleSaveOutfit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const trimmedTitle = outfitTitle.trim();
    if (trimmedTitle.length < 2) {
      setModalError("Give your lookbook a fun name (at least 2 characters)!");
      return;
    }

    if (visibilityMode === "circle_public" && !targetCircleId) {
      setModalError(
        "Please select a circle to share your lookbook for Yay/Nay voting."
      );
      return;
    }

    startTransition(async () => {
      const resolvedCircle =
        visibilityMode === "circle_public"
          ? targetCircleId
          : initialCircleId || null;

      const result = await createOutfit(
        trimmedTitle,
        selectedItemIds,
        resolvedCircle,
        visibilityMode
      );

      if (!result.success) {
        setModalError(result.error ?? "Failed to save lookbook.");
        return;
      }

      setIsSaveModalOpen(false);
      setOutfitTitle("");
      setSelectedItemIds([]);
      setFeedback({
        type: "success",
        text: result.message ?? "Lookbook saved!",
      });
      router.refresh();
    });
  };

  const handleToggleSavedVisibility = (outfit: SavedOutfitSummary) => {
    const nextVisibility: OutfitVisibility =
      outfit.visibility === "circle_public" ? "private" : "circle_public";
    const fallbackCircleId = outfit.circleId ?? circles[0]?.id ?? null;

    if (nextVisibility === "circle_public" && !fallbackCircleId) {
      setFeedback({
        type: "error",
        text: "Join or create a circle first to share lookbooks for Yay/Nay voting!",
      });
      return;
    }

    startTransition(async () => {
      const res = await toggleOutfitVisibility(
        outfit.id,
        nextVisibility,
        fallbackCircleId
      );
      if (res.success) {
        setFeedback({
          type: "success",
          text: res.message ?? "Visibility updated!",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          text: res.error ?? "Could not update visibility.",
        });
      }
    });
  };

  const handleDeleteOutfit = (outfitId: string, title: string) => {
    if (!window.confirm(`Delete lookbook "${title}"?`)) return;
    startTransition(async () => {
      const res = await deleteOutfit(outfitId);
      if (res.success) {
        setFeedback({
          type: "success",
          text: res.message ?? "Lookbook deleted.",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          text: res.error ?? "Could not delete lookbook.",
        });
      }
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      <main className="relative flex w-full max-w-md flex-1 flex-col justify-between bg-buttercream sm:rounded-[32px] sm:border sm:border-border-neutral sm:shadow-2xl">
        <div className="flex-1 p-4 sm:p-5 pb-8 sm:pb-8">
          {/* Top Navigation & Header */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-neutral bg-chalk px-3 py-2 text-xs font-bold text-midnight-slate transition hover:border-french-navy/40 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <span className="inline-flex items-center gap-1 rounded-full bg-dusty-lilac/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
              <Sparkles className="h-3 w-3" />
              LOOKBOOK STUDIO // SPRINT 4
            </span>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-midnight-slate">
                Outfit Canvas Builder
              </h1>
              <p className="mt-0.5 text-xs text-muted">
                Mix pieces from your closet & your friends&apos; circle racks ✨
              </p>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={cn(
                "mt-3 flex items-center justify-between gap-2 rounded-xl border p-3 text-xs font-semibold",
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              )}
            >
              <span>{feedback.text}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded-lg p-1 opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* OUTFIT CANVAS BOARD (Dusty Lilac & Chalk Stitch Aesthetic)     */}
          {/* ============================================================== */}
          <section
            aria-label="Outfit Canvas"
            className="mt-4 overflow-hidden rounded-2xl border-2 border-dusty-lilac/50 bg-gradient-to-br from-dusty-lilac/15 via-chalk to-buttercream p-3.5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-dusty-lilac text-white shadow-xs">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-midnight-slate">
                    Active Outfit Canvas
                  </h2>
                  <p className="font-mono text-[10px] text-muted">
                    {selectedItems.length} / {MAX_OUTFIT_ITEMS} pieces
                    {borrowedCountOnCanvas > 0 &&
                      ` • ${borrowedCountOnCanvas} from friends`}
                  </p>
                </div>
              </div>

              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedItemIds([])}
                  className="rounded-lg border border-border-neutral bg-buttercream px-2.5 py-1 text-[11px] font-bold text-muted transition hover:border-rose-300 hover:text-rose-600"
                >
                  Clear Canvas
                </button>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-dusty-lilac/50 bg-buttercream/80 px-4 py-7 text-center">
                <Sparkles className="h-6 w-6 text-dusty-lilac" />
                <p className="mt-2 text-xs font-bold text-midnight-slate">
                  Your Outfit Canvas is waiting for a look!
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Tap garments below from{" "}
                  <span className="font-semibold text-midnight-slate">
                    My Closet
                  </span>{" "}
                  or{" "}
                  <span className="font-semibold text-dusty-lilac">
                    Circle Closets
                  </span>{" "}
                  to layer your outfit.
                </p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {selectedItems.map((item) => {
                  const isMine = item.owner_id === currentUserId;
                  return (
                    <div
                      key={item.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-border-neutral bg-buttercream shadow-xs"
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-chalk">
                        <Image
                          src={item.image_url}
                          alt={item.title}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleCanvasItem(item)}
                          aria-label={`Remove ${item.title} from canvas`}
                          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-midnight-slate/80 text-white shadow-xs transition hover:bg-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={cn(
                            "absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase shadow-xs",
                            isMine
                              ? "bg-french-navy/90 text-white"
                              : "bg-dusty-lilac/95 text-white"
                          )}
                        >
                          {isMine
                            ? "Mine"
                            : `@${item.ownerName.split(" ")[0]}`}
                        </span>
                      </div>
                      <div className="p-1.5">
                        <p className="truncate text-[10px] font-bold text-midnight-slate">
                          {item.title}
                        </p>
                        <p className="truncate font-mono text-[9px] text-muted">
                          {item.category}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save Outfit Master Trigger */}
            <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border-neutral/80 pt-3">
              <div className="text-[11px] font-medium text-graphite">
                {selectedItems.length === 0
                  ? "Select pieces below to unlock Save"
                  : `Ready to save ${selectedItems.length} ${
                      selectedItems.length === 1 ? "piece" : "pieces"
                    }`}
              </div>

              <button
                type="button"
                disabled={selectedItems.length === 0 || isPending}
                onClick={handleOpenSaveModal}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95",
                  selectedItems.length > 0
                    ? "bg-french-navy hover:bg-french-navy-hover"
                    : "cursor-not-allowed bg-french-navy/40"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-dusty-lilac" />
                Save Outfit
              </button>
            </div>
          </section>

          {/* ============================================================== */}
          {/* TABBED ITEM SELECTOR ('My Closet' vs 'Circle Closets')         */}
          {/* ============================================================== */}
          <section className="mt-5" aria-label="Wardrobe Item Selector">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-neutral bg-chalk p-1.5">
              <button
                type="button"
                onClick={() => setActiveClosetTab("my_closet")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition",
                  activeClosetTab === "my_closet"
                    ? "bg-french-navy text-white shadow-xs"
                    : "text-muted hover:text-midnight-slate"
                )}
              >
                <Shirt className="h-3.5 w-3.5" />
                My Closet ({myClosetItems.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveClosetTab("circle_closets")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition",
                  activeClosetTab === "circle_closets"
                    ? "bg-dusty-lilac text-white shadow-xs"
                    : "text-muted hover:text-midnight-slate"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Circle Closets ({circleClosetItems.length})
              </button>
            </div>

            {/* Optional Circle Filter when on 'Circle Closets' tab */}
            {activeClosetTab === "circle_closets" && circles.length > 0 && (
              <div className="hide-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCircleFilter("all")}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition",
                    selectedCircleFilter === "all"
                      ? "bg-dusty-lilac text-white"
                      : "border border-border-neutral bg-chalk text-muted hover:text-midnight-slate"
                  )}
                >
                  All Circles
                </button>
                {circles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCircleFilter(c.id)}
                    className={cn(
                      "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition",
                      selectedCircleFilter === c.id
                        ? "bg-dusty-lilac text-white"
                        : "border border-border-neutral bg-chalk text-muted hover:text-midnight-slate"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Category Filter Pills */}
            <div className="hide-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-1">
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold tracking-tight transition",
                      isActive
                        ? "bg-french-navy text-white shadow-xs"
                        : "border border-border-neutral bg-chalk text-muted hover:text-midnight-slate"
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Garment Selector Grid */}
            <div className="mt-3">
              {displayedSelectorItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-7 text-center">
                  <Shirt className="h-6 w-6 text-muted" />
                  <p className="mt-2 text-xs font-bold text-midnight-slate">
                    {activeClosetTab === "my_closet"
                      ? "No matching pieces in My Closet"
                      : "No matching pieces in Circle Closets"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {activeClosetTab === "my_closet"
                      ? "Upload items in MyDrobe or switch to Circle Closets to style friends' pieces."
                      : "Ask friends to share items into your circles to mix them into lookbooks!"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {displayedSelectorItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    const isMine = item.owner_id === currentUserId;
                    return (
                      <button
                        key={`${activeClosetTab}-${item.id}`}
                        type="button"
                        onClick={() => handleToggleCanvasItem(item)}
                        className={cn(
                          "group relative flex flex-col overflow-hidden rounded-2xl border text-left transition active:scale-[0.99]",
                          isSelected
                            ? "border-2 border-dusty-lilac bg-dusty-lilac/10 shadow-md ring-2 ring-dusty-lilac/30"
                            : "border-border-neutral bg-chalk hover:border-french-navy/40"
                        )}
                      >
                        <div className="relative aspect-[4/5] w-full overflow-hidden bg-buttercream">
                          <Image
                            src={item.image_url}
                            alt={item.title}
                            fill
                            unoptimized
                            className="object-cover transition duration-300 group-hover:scale-105"
                          />

                          {/* Selection Check Badge */}
                          <div
                            className={cn(
                              "absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border shadow-xs transition",
                              isSelected
                                ? "border-dusty-lilac bg-dusty-lilac text-white"
                                : "border-border-strong bg-buttercream/90 text-midnight-slate"
                            )}
                          >
                            {isSelected ? (
                              <Check className="h-4 w-4 stroke-[2.5]" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </div>

                          {/* Owner / Circle Badge */}
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                "truncate rounded-md px-2 py-0.5 font-mono text-[9px] font-bold uppercase shadow-xs",
                                isMine
                                  ? "bg-french-navy/90 text-white"
                                  : "bg-dusty-lilac/95 text-white"
                              )}
                            >
                              {isMine ? "My Closet" : `${item.ownerName}'s`}
                            </span>
                            {item.status !== "Available" && (
                              <span className="rounded-md bg-amber-500/95 px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                                {item.status}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-2.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-dusty-lilac">
                              {item.category}
                            </span>
                            {item.circleName && (
                              <span className="truncate font-mono text-[9px] text-muted">
                                {item.circleName}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs font-bold text-midnight-slate">
                            {item.title}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ============================================================== */}
          {/* SAVED LOOKBOOKS SECTION                                        */}
          {/* ============================================================== */}
          {savedOutfits.length > 0 && (
            <section
              className="mt-6 border-t border-border-neutral pt-5"
              aria-label="Your Saved Lookbooks"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-midnight-slate">
                    Your Saved Lookbooks ({savedOutfits.length})
                  </h2>
                  <p className="text-[11px] text-muted">
                    Tap a lookbook to open details or toggle circle polling
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {savedOutfits.map((outfit) => {
                  const isPublic = outfit.visibility === "circle_public";
                  return (
                    <div
                      key={outfit.id}
                      className="rounded-2xl border border-dusty-lilac/40 bg-chalk p-3.5 shadow-xs transition hover:border-dusty-lilac"
                    >
                      {/* Top Status Row + Compact Delete Action */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9px] font-bold uppercase",
                              isPublic
                                ? "bg-dusty-lilac text-white"
                                : "bg-french-navy/10 text-french-navy"
                            )}
                          >
                            {isPublic ? (
                              <>
                                <Globe className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">
                                  {outfit.circleName
                                    ? `Shared in ${outfit.circleName}`
                                    : "Circle Public"}
                                </span>
                              </>
                            ) : (
                              <>
                                <Lock className="h-2.5 w-2.5 shrink-0" />
                                <span>Private Look</span>
                              </>
                            )}
                          </span>

                          {isPublic && (
                            <span className="inline-flex items-center gap-2 rounded-md bg-buttercream px-2 py-0.5 font-mono text-[10px] font-bold text-midnight-slate">
                              <span className="inline-flex items-center gap-0.5 text-emerald-700">
                                <ThumbsUp className="h-2.5 w-2.5" />{" "}
                                {outfit.yayCount}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-rose-700">
                                <ThumbsDown className="h-2.5 w-2.5" />{" "}
                                {outfit.nayCount}
                              </span>
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            handleDeleteOutfit(outfit.id, outfit.title)
                          }
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-neutral bg-buttercream text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          title="Delete lookbook"
                          aria-label={`Delete ${outfit.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Clickable Title & Garment Collage Strip */}
                      <Link
                        href={`/outfits/${outfit.id}?from=/outfits/builder`}
                        className="mt-2 block group"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="truncate text-sm font-extrabold text-midnight-slate group-hover:text-french-navy">
                            {outfit.title}
                          </h3>
                          <span className="shrink-0 font-mono text-[10px] text-muted">
                            {outfit.items.length}{" "}
                            {outfit.items.length === 1 ? "piece" : "pieces"}
                          </span>
                        </div>

                        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                          {outfit.items.map((piece) => (
                            <div
                              key={piece.id}
                              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border-neutral bg-buttercream transition group-hover:border-french-navy/40"
                            >
                              <Image
                                src={piece.image_url}
                                alt={piece.title}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </Link>

                      {/* Side-by-Side Equal-Height Action Toolbar */}
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-neutral/70 pt-2.5">
                        <Link
                          href={`/outfits/${outfit.id}?from=/outfits/builder`}
                          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-french-navy px-3 text-[11px] font-bold whitespace-nowrap text-white shadow-2xs transition hover:bg-french-navy-hover active:scale-95"
                        >
                          <Eye className="h-3.5 w-3.5 text-dusty-lilac" />
                          <span>Open Lookbook</span>
                        </Link>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleSavedVisibility(outfit)}
                          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-buttercream px-3 text-[11px] font-bold whitespace-nowrap text-midnight-slate transition hover:border-dusty-lilac hover:bg-dusty-lilac/10 active:scale-95 disabled:opacity-50"
                          title="Toggle Private / Circle Public"
                        >
                          {isPublic ? (
                            <>
                              <Lock className="h-3 w-3 text-french-navy" />
                              <span>Make Private</span>
                            </>
                          ) : (
                            <>
                              <Globe className="h-3 w-3 text-dusty-lilac" />
                              <span>Share for Poll</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* ================================================================ */}
        {/* SAVE OUTFIT MODAL ('Keep Private' vs 'Share to Circle Yay/Nay')  */}
        {/* ================================================================ */}
        {isSaveModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-outfit-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-slate/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-dusty-lilac/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-dusty-lilac">
                    <Sparkles className="h-3 w-3" />
                    SAVE LOOKBOOK
                  </span>
                  <h2
                    id="save-outfit-modal-title"
                    className="mt-1 text-lg font-extrabold text-midnight-slate"
                  >
                    Name & Share Your Fit
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="rounded-xl border border-border-neutral bg-chalk p-1.5 text-muted hover:text-midnight-slate"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveOutfit} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="outfit-title-input"
                    className="block font-mono text-[10px] font-bold uppercase tracking-wider text-muted"
                  >
                    Lookbook Title
                  </label>
                  <input
                    id="outfit-title-input"
                    type="text"
                    required
                    maxLength={80}
                    value={outfitTitle}
                    onChange={(e) => setOutfitTitle(e.target.value)}
                    placeholder="e.g., Soho Gallery Night Out ✨"
                    className="mt-1.5 w-full rounded-xl border border-border-strong bg-chalk px-3.5 py-2.5 text-xs font-semibold text-midnight-slate placeholder:text-muted focus:border-french-navy focus:outline-hidden"
                  />
                </div>

                {/* Visibility Toggle: 'Keep Private' vs 'Share to Circle for Yay/Nay' */}
                <div>
                  <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                    Visibility & Circle Poll
                  </span>
                  <div className="mt-1.5 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibilityMode("private")}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-3 text-left transition",
                        visibilityMode === "private"
                          ? "border-2 border-french-navy bg-french-navy/5"
                          : "border-border-neutral bg-chalk hover:border-french-navy/40"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-french-navy text-white">
                          <Lock className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-midnight-slate">
                            Keep Private
                          </p>
                          <p className="text-[10px] text-muted">
                            Only visible in your personal Lookbook Studio
                          </p>
                        </div>
                      </div>
                      {visibilityMode === "private" && (
                        <Check className="h-4 w-4 text-french-navy" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisibilityMode("circle_public")}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-3 text-left transition",
                        visibilityMode === "circle_public"
                          ? "border-2 border-dusty-lilac bg-dusty-lilac/15"
                          : "border-border-neutral bg-chalk hover:border-dusty-lilac/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dusty-lilac text-white">
                          <Globe className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-midnight-slate">
                            Share to Circle for Yay/Nay
                          </p>
                          <p className="text-[10px] text-muted">
                            Drops a Dusty Lilac Lookbook Card for 👍/👎 votes!
                          </p>
                        </div>
                      </div>
                      {visibilityMode === "circle_public" && (
                        <Check className="h-4 w-4 text-dusty-lilac" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Circle Picker when 'Share to Circle for Yay/Nay' is chosen */}
                {visibilityMode === "circle_public" && (
                  <div>
                    <label
                      htmlFor="target-circle-select"
                      className="block font-mono text-[10px] font-bold uppercase tracking-wider text-muted"
                    >
                      Select Circle for Poll
                    </label>
                    {circles.length === 0 ? (
                      <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-medium text-amber-900">
                        You aren&apos;t in any circles yet! Save as Private or
                        create a circle in ShareDrobe first.
                      </p>
                    ) : (
                      <select
                        id="target-circle-select"
                        value={targetCircleId}
                        onChange={(e) => setTargetCircleId(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-border-strong bg-chalk px-3 py-2.5 text-xs font-bold text-midnight-slate focus:border-dusty-lilac focus:outline-hidden"
                      >
                        {circles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {modalError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-800">
                    {modalError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsSaveModalOpen(false)}
                    className="rounded-xl border border-border-neutral bg-chalk px-4 py-2.5 text-xs font-bold text-graphite hover:text-midnight-slate"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isPending ||
                      (visibilityMode === "circle_public" &&
                        circles.length === 0)
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-french-navy px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-french-navy-hover disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-dusty-lilac" />
                    {isPending
                      ? "Saving..."
                      : visibilityMode === "circle_public"
                      ? "Drop Lookbook in Circle ✨"
                      : "Save Private Look 🔒"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Docked Bottom Navigation */}
        <BottomNav />
      </main>
    </div>
  );
}
