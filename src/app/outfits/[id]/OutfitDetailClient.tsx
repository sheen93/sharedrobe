"use client";

import { useState, useMemo, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Globe,
  Check,
  Clock,
  Shirt,
  X,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  castOutfitVote,
  batchBorrowOutfitItems,
  toggleOutfitVisibility,
} from "@/app/outfits/actions";
import {
  BORROW_DURATION_OPTIONS,
  type BorrowDurationOption,
} from "@/app/sharedrobe/constants";
import type { OutfitVisibility, OutfitVoteType } from "@/app/outfits/constants";
import { cn } from "@/utils/cn";

export interface OutfitDetailGarment {
  id: string;
  title: string;
  category: string;
  tags: string[];
  image_url: string;
  owner_id: string;
  ownerName: string;
  status: string;
  hasPendingRequest: boolean;
}

export interface OutfitDetailData {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  circleId: string | null;
  circleName: string | null;
  visibility: OutfitVisibility;
  createdAt: string;
  yayCount: number;
  nayCount: number;
  myVote: OutfitVoteType | null;
  items: OutfitDetailGarment[];
}

interface OutfitDetailClientProps {
  outfit: OutfitDetailData;
  currentUserId: string;
  backHref: string | null;
}

export default function OutfitDetailClient({
  outfit,
  currentUserId,
  backHref,
}: OutfitDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Optimistic voting state
  const [optimisticVote, setOptimisticVote] = useState<OutfitVoteType | null>(
    outfit.myVote
  );
  const [yayCount, setYayCount] = useState<number>(outfit.yayCount);
  const [nayCount, setNayCount] = useState<number>(outfit.nayCount);

  // Batch Borrow Modal state
  const [isBatchBorrowModalOpen, setIsBatchBorrowModalOpen] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<
    BorrowDurationOption | ""
  >("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [localBatchRequestedIds, setLocalBatchRequestedIds] = useState<
    string[]
  >([]);

  // Feedback banner
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const isCreator = outfit.creatorId === currentUserId;
  const isCirclePublic = outfit.visibility === "circle_public";

  // Non-owned items in this outfit
  const nonOwnedItems = useMemo(
    () => outfit.items.filter((item) => item.owner_id !== currentUserId),
    [outfit.items, currentUserId]
  );

  // Non-owned items that are Available and not yet requested by currentUserId
  const borrowableRemainingItems = useMemo(
    () =>
      nonOwnedItems.filter(
        (item) =>
          item.status === "Available" &&
          !item.hasPendingRequest &&
          !localBatchRequestedIds.includes(item.id)
      ),
    [nonOwnedItems, localBatchRequestedIds]
  );

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  const handleVote = (vote: OutfitVoteType) => {
    if (!isCirclePublic) return;

    const prevVote = optimisticVote;
    const prevYay = yayCount;
    const prevNay = nayCount;

    if (prevVote !== vote) {
      setOptimisticVote(vote);
      if (vote === "yay") {
        setYayCount((c) => c + 1);
        if (prevVote === "nay") setNayCount((c) => Math.max(0, c - 1));
      } else {
        setNayCount((c) => c + 1);
        if (prevVote === "yay") setYayCount((c) => Math.max(0, c - 1));
      }
    }

    startTransition(async () => {
      const res = await castOutfitVote(outfit.id, vote);
      if (!res.success) {
        setOptimisticVote(prevVote);
        setYayCount(prevYay);
        setNayCount(prevNay);
        setFeedback({
          tone: "error",
          text: res.error ?? "Could not record vote.",
        });
        return;
      }
      setFeedback({
        tone: "success",
        text: res.message ?? `Voted ${vote.toUpperCase()}!`,
      });
      router.refresh();
    });
  };

  const handleToggleVisibility = () => {
    const nextVisibility: OutfitVisibility = isCirclePublic
      ? "private"
      : "circle_public";

    startTransition(async () => {
      const res = await toggleOutfitVisibility(
        outfit.id,
        nextVisibility,
        outfit.circleId
      );
      if (!res.success) {
        setFeedback({
          tone: "error",
          text: res.error ?? "Could not change visibility.",
        });
        return;
      }
      setFeedback({
        tone: "success",
        text: res.message ?? "Lookbook visibility updated!",
      });
      router.refresh();
    });
  };

  const handleBatchBorrowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!selectedDuration) {
      setModalError("Pick how long you're borrowing these pieces for!");
      return;
    }

    startTransition(async () => {
      const res = await batchBorrowOutfitItems(outfit.id, selectedDuration);
      if (!res.success) {
        setModalError(res.error ?? "Could not submit borrow requests.");
        return;
      }

      setLocalBatchRequestedIds((prev) => [
        ...prev,
        ...borrowableRemainingItems.map((i) => i.id),
      ]);
      setIsBatchBorrowModalOpen(false);
      setSelectedDuration("");
      setFeedback({
        tone: "success",
        text:
          res.message ??
          "Borrow requests sent to all item owners in this lookbook! ✨",
      });
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      <main className="relative flex w-full max-w-md flex-1 flex-col justify-between bg-buttercream sm:rounded-[32px] sm:border sm:border-border-neutral sm:shadow-2xl">
        <div className="flex-1 p-4 pb-8 sm:p-5 sm:pb-8">
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-neutral bg-chalk px-3 py-2 text-xs font-bold text-midnight-slate transition hover:border-french-navy active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-1.5">
              {isCreator && outfit.circleId && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleToggleVisibility}
                  className="inline-flex items-center gap-1 rounded-xl border border-border-strong bg-chalk px-3 py-1.5 text-[11px] font-bold text-midnight-slate transition hover:border-dusty-lilac"
                >
                  {isCirclePublic ? (
                    <>
                      <Lock className="h-3 w-3 text-french-navy" />
                      Make Private
                    </>
                  ) : (
                    <>
                      <Globe className="h-3 w-3 text-dusty-lilac" />
                      Share for Yay/Nay
                    </>
                  )}
                </button>
              )}

              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider",
                  isCirclePublic
                    ? "bg-dusty-lilac text-white"
                    : "bg-french-navy/10 text-french-navy"
                )}
              >
                {isCirclePublic ? (
                  <>
                    <Globe className="h-3 w-3" />
                    {outfit.circleName || "Circle Poll"}
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" />
                    Private Look
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Lookbook Hero Header Card */}
          <div className="mt-4 overflow-hidden rounded-3xl border-2 border-dusty-lilac/60 bg-gradient-to-br from-dusty-lilac/25 via-chalk to-buttercream p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-dusty-lilac">
                  <Sparkles className="h-3 w-3" />
                  CURATED LOOKBOOK // {outfit.items.length}{" "}
                  {outfit.items.length === 1 ? "PIECE" : "PIECES"}
                </span>
                <h1 className="mt-1 text-xl font-extrabold tracking-tight text-midnight-slate">
                  {outfit.title}
                </h1>
                <p className="mt-0.5 text-xs font-medium text-graphite">
                  Styled by{" "}
                  <span className="font-bold text-midnight-slate">
                    {isCreator ? "You" : outfit.creatorName}
                  </span>
                  {outfit.circleName && ` in ${outfit.circleName}`}
                </p>
              </div>
            </div>

            {/* Yay / Nay Poll Bar if Circle Public */}
            {isCirclePublic && (
              <div className="mt-4 rounded-2xl border border-dusty-lilac/40 bg-buttercream/95 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-midnight-slate">
                    Circle Fit Check Poll ✨
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {yayCount + nayCount}{" "}
                    {yayCount + nayCount === 1 ? "vote" : "votes"} cast
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVote("yay")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-extrabold transition active:scale-95",
                      optimisticVote === "yay"
                        ? "border-2 border-emerald-600 bg-emerald-600 text-white shadow-sm"
                        : "border-border-strong bg-chalk text-midnight-slate hover:border-emerald-500"
                    )}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span>👍 Yay ({yayCount})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVote("nay")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-extrabold transition active:scale-95",
                      optimisticVote === "nay"
                        ? "border-2 border-rose-600 bg-rose-600 text-white shadow-sm"
                        : "border-border-strong bg-chalk text-midnight-slate hover:border-rose-500"
                    )}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    <span>👎 Nay ({nayCount})</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={cn(
                "mt-3 flex items-center justify-between gap-2 rounded-xl border p-3 text-xs font-semibold",
                feedback.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              )}
            >
              <div className="flex items-center gap-2">
                {feedback.tone === "success" ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded-lg p-1 opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Pieces in this Lookbook */}
          <section className="mt-5" aria-label="Lookbook Garments">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-midnight-slate">
                Pieces in This Fit ({outfit.items.length})
              </h2>
              <span className="font-mono text-[10px] text-muted">
                {nonOwnedItems.length === 0
                  ? "100% from your closet"
                  : `${nonOwnedItems.length} from friends' closets`}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {outfit.items.map((item) => {
                const isMine = item.owner_id === currentUserId;
                const isPendingReq =
                  item.hasPendingRequest ||
                  localBatchRequestedIds.includes(item.id);

                return (
                  <Link
                    key={item.id}
                    href={`/items/${item.id}?from=/outfits/${outfit.id}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border-neutral bg-chalk shadow-2xs transition hover:border-french-navy/40 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-buttercream">
                      <Image
                        src={item.image_url}
                        alt={item.title}
                        fill
                        unoptimized
                        className="object-cover transition duration-300 group-hover:scale-105"
                      />

                      <span
                        className={cn(
                          "absolute top-2 left-2 rounded-md px-2 py-0.5 font-mono text-[9px] font-bold uppercase shadow-xs",
                          isMine
                            ? "bg-french-navy/90 text-white"
                            : "bg-dusty-lilac/95 text-white"
                        )}
                      >
                        {isMine
                          ? "Your Piece"
                          : `${item.ownerName.split(" ")[0]}'s Closet`}
                      </span>

                      <span className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-buttercream/90 text-midnight-slate shadow-2xs">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </span>

                      {!isMine && (
                        <div className="absolute bottom-2 left-2 right-2">
                          {isPendingReq ? (
                            <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-dusty-lilac/95 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-xs">
                              <Clock className="h-2.5 w-2.5" />
                              Borrow Request Pending ✨
                            </span>
                          ) : item.status === "Available" ? (
                            <span className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600/95 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-xs">
                              Available to Borrow
                            </span>
                          ) : (
                            <span className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500/95 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-xs">
                              {item.status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-2.5">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-dusty-lilac">
                        {item.category}
                      </span>
                      <h3 className="mt-0.5 truncate text-xs font-extrabold text-midnight-slate">
                        {item.title}
                      </h3>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ============================================================== */}
          {/* MASTER BATCH BORROW ACTION CARD (For Non-Owned Outfit Items)   */}
          {/* ============================================================== */}
          {nonOwnedItems.length > 0 && (
            <section
              aria-label="Batch Borrow Controls"
              className="mt-6 rounded-2xl border-2 border-dusty-lilac/60 bg-chalk p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-french-navy text-white shadow-xs">
                  <Shirt className="h-5 w-5 text-dusty-lilac" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-extrabold text-midnight-slate">
                    Complete This Lookbook ✨
                  </h3>
                  <p className="mt-0.5 text-xs text-graphite">
                    {borrowableRemainingItems.length > 0
                      ? `This outfit includes ${borrowableRemainingItems.length} available ${
                          borrowableRemainingItems.length === 1
                            ? "piece"
                            : "pieces"
                        } from your friends' closets. Request them all in one tap!`
                      : "All friend pieces in this lookbook have already been requested or are currently lent out."}
                  </p>
                </div>
              </div>

              {borrowableRemainingItems.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setModalError(null);
                    setIsBatchBorrowModalOpen(true);
                  }}
                  className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-french-navy px-4 py-3 text-xs font-extrabold text-white shadow-md transition hover:bg-french-navy-hover active:scale-[0.99]"
                >
                  <Sparkles className="h-4 w-4 text-dusty-lilac" />
                  <span>
                    Request to Borrow Remaining Items (
                    {borrowableRemainingItems.length})
                  </span>
                </button>
              ) : (
                <div className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dusty-lilac/40 bg-dusty-lilac/15 px-4 py-2.5 font-mono text-xs font-bold text-french-navy">
                  <Clock className="h-4 w-4 text-dusty-lilac" />
                  <span>All Borrowable Pieces Requested ✨</span>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ================================================================ */}
        {/* BATCH BORROW REQUEST MODAL (With Mandatory Fun Duration Intents) */}
        {/* ================================================================ */}
        {isBatchBorrowModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-borrow-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-slate/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-dusty-lilac/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-dusty-lilac">
                    <Sparkles className="h-3 w-3" />
                    BATCH DIBS // {borrowableRemainingItems.length}{" "}
                    {borrowableRemainingItems.length === 1 ? "ITEM" : "ITEMS"}
                  </span>
                  <h2
                    id="batch-borrow-modal-title"
                    className="mt-1 text-lg font-extrabold text-midnight-slate"
                  >
                    Borrow Remaining Pieces
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBatchBorrowModalOpen(false)}
                  className="rounded-xl border border-border-neutral bg-chalk p-1.5 text-muted hover:text-midnight-slate"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* List of items being batch-requested */}
              <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto rounded-2xl border border-border-neutral bg-chalk p-2.5">
                {borrowableRemainingItems.map((piece) => (
                  <div
                    key={piece.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-buttercream px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border-neutral">
                        <Image
                          src={piece.image_url}
                          alt={piece.title}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                      <p className="truncate text-xs font-bold text-midnight-slate">
                        {piece.title}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] font-semibold text-dusty-lilac">
                      @{piece.ownerName.split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleBatchBorrowSubmit} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="batch-duration-select"
                    className="block font-mono text-[10px] font-bold uppercase tracking-wider text-muted"
                  >
                    How long are you borrowing this fit for? (Required)
                  </label>
                  <select
                    id="batch-duration-select"
                    required
                    value={selectedDuration}
                    onChange={(e) =>
                      setSelectedDuration(
                        e.target.value as BorrowDurationOption | ""
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-border-strong bg-chalk px-3 py-2.5 text-xs font-bold text-midnight-slate focus:border-french-navy focus:outline-hidden"
                  >
                    <option value="" disabled>
                      Choose your borrow vibe...
                    </option>
                    {BORROW_DURATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {modalError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-800">
                    {modalError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsBatchBorrowModalOpen(false)}
                    className="rounded-xl border border-border-neutral bg-chalk px-4 py-2.5 text-xs font-bold text-graphite hover:text-midnight-slate"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !selectedDuration}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-french-navy px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-french-navy-hover disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-dusty-lilac" />
                    {isPending
                      ? "Sending Requests..."
                      : `Send ${borrowableRemainingItems.length} ${
                          borrowableRemainingItems.length === 1
                            ? "Request"
                            : "Requests"
                        } ✨`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Docked Bottom Nav */}
        <BottomNav />
      </main>
    </div>
  );
}
