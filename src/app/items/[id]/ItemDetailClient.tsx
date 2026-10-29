"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shirt,
  Tag,
  Trash2,
  Loader2,
  Check,
  Users,
  Clock,
  Megaphone,
  Mail,
  Siren,
  Sparkles,
  X,
  Copy,
  Camera,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import BorrowRequestModal from "@/components/BorrowRequestModal";
import FormMessage from "@/components/ui/FormMessage";
import { cn } from "@/utils/cn";
import {
  updateItemStatus,
  updateItemTags,
  deleteItem,
} from "@/app/items/actions";
import {
  nudgeReturn,
  resolveBorrowDrama,
  cancelBorrowRequest,
} from "@/app/sharedrobe/actions";
import {
  ALLOWED_ITEM_STATUSES,
  ALLOWED_ITEM_TAGS,
  type ItemStatus,
} from "@/app/items/constants";

export interface FriendOption {
  id: string;
  fullName: string;
  email: string;
}

export interface ItemDetailData {
  id: string;
  ownerId: string;
  title: string;
  category: string;
  imageUrl: string;
  tags: string[];
  status: ItemStatus;
  borrowedBy: string | null;
  borrowerName: string | null;
  ownerName: string;
  createdAt: string;
}

interface ItemDetailClientProps {
  item: ItemDetailData;
  friends: FriendOption[];
  isOwner: boolean;
  currentUserId: string;
  backHref?: string;
  borrowCircle?: { id: string; name: string } | null;
  initialPendingBorrowRequest?: { id: string; durationIntent: string } | null;
}

export default function ItemDetailClient({
  item,
  friends,
  isOwner,
  currentUserId,
  backHref = "/",
  borrowCircle = null,
  initialPendingBorrowRequest = null,
}: ItemDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<
    | "status"
    | "tags"
    | "delete"
    | "nudge_private"
    | "nudge_public"
    | "resolve_drama"
    | "cancel_borrow"
    | null
  >(null);

  // Status state
  const [currentStatus, setCurrentStatus] = useState<ItemStatus>(item.status);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string | null>(
    item.borrowedBy
  );

  // Tags state
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags);

  // Modals state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isNudgeModalOpen, setIsNudgeModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [hasRequestedBorrow, setHasRequestedBorrow] = useState(
    Boolean(initialPendingBorrowRequest)
  );

  const handleDuplicateConfirm = (duplicatePhoto: boolean) => {
    setIsDuplicateModalOpen(false);
    try {
      const duplicateData = {
        title: duplicatePhoto ? `${item.title} (Copy)` : item.title,
        category: item.category,
        tags: selectedTags.length > 0 ? selectedTags : item.tags,
        is_sharable: true,
        imageUrl: duplicatePhoto ? item.imageUrl : null,
      };
      localStorage.setItem(
        "sharedrobe_duplicate_item",
        JSON.stringify(duplicateData)
      );
    } catch (err) {
      console.warn("Could not save duplicate item to localStorage:", err);
    }
    router.push("/?action=add_item");
  };

  // Feedback banner state
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const showFeedback = (tone: "success" | "error", text: string) => {
    setFeedback({ tone, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Has status changed from saved value?
  const isStatusChanged =
    currentStatus !== item.status ||
    (currentStatus === "Lent Out" && selectedBorrowerId !== item.borrowedBy);

  // Has tags changed from saved value?
  const areTagsChanged =
    selectedTags.length !== item.tags.length ||
    !selectedTags.every((t) => item.tags.includes(t));

  // Toggle tag selection
  const handleToggleTag = (tag: string) => {
    if (!isOwner) return;
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Save Status
  const handleSaveStatus = () => {
    if (!isOwner || isPending) return;

    if (currentStatus === "Lent Out" && !selectedBorrowerId) {
      showFeedback("error", "Please select which friend borrowed this garment.");
      return;
    }

    setActiveAction("status");
    startTransition(async () => {
      const res = await updateItemStatus(
        item.id,
        currentStatus,
        currentStatus === "Lent Out" ? selectedBorrowerId : null
      );
      setActiveAction(null);

      if (res.success) {
        showFeedback("success", `Garment status updated to "${currentStatus}".`);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  // Save Tags
  const handleSaveTags = () => {
    if (!isOwner || isPending) return;

    setActiveAction("tags");
    startTransition(async () => {
      const res = await updateItemTags(item.id, selectedTags);
      setActiveAction(null);

      if (res.success) {
        showFeedback("success", "Garment tags updated successfully.");
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  // Navigate back to the previous screen (e.g. Circle Closet, ShareDrobe, or MyDrobe)
  const handleBack = () => {
    if (backHref && backHref !== "/") {
      router.push(backHref);
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin)
    ) {
      router.back();
      return;
    }

    router.push("/");
  };

  // Delete Garment
  const handleConfirmDelete = () => {
    if (!isOwner || isPending) return;

    setActiveAction("delete");
    startTransition(async () => {
      const res = await deleteItem(item.id, item.imageUrl);
      setActiveAction(null);

      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push(backHref || "/");
      } else {
        showFeedback("error", res.error);
        setIsDeleteModalOpen(false);
      }
    });
  };

  // Nudge Borrower to Return Garment ('private' | 'public')
  const handleNudgeReturn = (type: "private" | "public") => {
    if (!isOwner || isPending) return;

    setActiveAction(type === "private" ? "nudge_private" : "nudge_public");
    startTransition(async () => {
      const res = await nudgeReturn(item.id, type);
      setActiveAction(null);
      setIsNudgeModalOpen(false);

      if (res.success) {
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  // Resolve Borrow Drama & Mark Item Returned
  const handleResolveDrama = () => {
    if (isPending) return;

    setActiveAction("resolve_drama");
    startTransition(async () => {
      const res = await resolveBorrowDrama({
        itemId: item.id,
        circleId: borrowCircle?.id ?? null,
      });
      setActiveAction(null);

      if (res.success) {
        setCurrentStatus("Available");
        setSelectedBorrowerId(null);
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  // Cancel Pending Borrow Request before Lender Approves
  const handleCancelBorrowRequest = () => {
    if (isPending) return;

    setActiveAction("cancel_borrow");
    startTransition(async () => {
      const res = await cancelBorrowRequest({
        requestId: initialPendingBorrowRequest?.id ?? null,
        itemId: item.id,
        circleId: borrowCircle?.id ?? null,
      });
      setActiveAction(null);

      if (res.success) {
        setHasRequestedBorrow(false);
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-linen sm:p-6 lg:p-8">
      <main className="relative flex w-full max-w-md flex-1 flex-col justify-between bg-buttercream sm:rounded-[32px] sm:border sm:border-border-neutral sm:shadow-2xl">
        <div className="flex-1 p-4 sm:p-5 pb-8 sm:pb-8">
          {/* Screen Header with back link */}
        <header className="flex items-center justify-between border-b border-border-neutral px-1 pt-1 pb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-french-navy transition hover:bg-border-neutral active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
                WARDROBE // DETAIL
              </p>
              <h1 className="text-xl font-bold tracking-tight text-midnight-slate truncate max-w-[240px]">
                {item.title}
              </h1>
            </div>
          </div>

          <span className="rounded-lg border border-border-neutral bg-chalk px-2 py-0.5 font-mono text-[11px] font-bold text-french-navy">
            {item.category}
          </span>
        </header>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div className="mt-3">
            <FormMessage tone={feedback.tone}>{feedback.text}</FormMessage>
          </div>
        )}

        {/* High-Res Garment Image Container */}
        <div className="relative mt-3.5 overflow-hidden rounded-2xl border border-border-neutral bg-chalk shadow-xs">
          <div className="relative aspect-square w-full bg-chalk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.title}
              className="h-full w-full object-cover"
            />

            {/* Category badge */}
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-lg bg-midnight-slate/80 px-2 py-1 font-mono text-[10px] font-bold uppercase text-white backdrop-blur-xs">
              <Shirt size={11} />
              <span>{item.category}</span>
            </div>

            {/* Current Status Pill */}
            <div className="absolute top-2.5 right-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold shadow-xs backdrop-blur-xs",
                  item.status === "Available" &&
                    "bg-emerald-500/90 text-white border border-emerald-400",
                  item.status === "Lent Out" &&
                    "bg-dusty-lilac/90 text-white border border-dusty-lilac",
                  item.status === "In Laundry" &&
                    "bg-amber-500/90 text-white border border-amber-400"
                )}
              >
                {item.status === "Available" && <Check size={11} strokeWidth={3} />}
                {item.status === "Lent Out" && <Users size={11} />}
                {item.status === "In Laundry" && <Clock size={11} />}
                <span>
                  {item.status === "Lent Out" && item.borrowerName
                    ? `Lent to ${item.borrowerName.split(" ")[0]}`
                    : item.status}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Garment Details & Management */}
        <div className="mt-4 space-y-4">
          {/* SECTION 1: STATUS TOGGLE & CONDITIONAL FRIEND SELECTOR */}
          <section className="rounded-2xl border border-border-neutral bg-chalk p-3.5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                  LENDING & CLOSET STATUS
                </span>
              </div>
              {!isOwner && (
                <span className="font-mono text-[9px] text-muted">View Only</span>
              )}
            </div>

            {isOwner ? (
              <div className="space-y-3">
                {/* Status Segmented Select / Dropdown */}
                <div className="grid grid-cols-3 gap-1.5">
                  {ALLOWED_ITEM_STATUSES.map((st) => {
                    const isSelected = currentStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setCurrentStatus(st)}
                        className={cn(
                          "flex flex-col items-center justify-center rounded-xl border py-2 px-1 text-center transition active:scale-95",
                          isSelected
                            ? "border-french-navy bg-french-navy text-white shadow-xs font-bold"
                            : "border-border-neutral bg-white text-muted hover:border-dusty-lilac hover:text-midnight-slate font-medium text-xs"
                        )}
                      >
                        <span className="text-[11px] leading-tight">{st}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Conditional Friend Selector (when 'Lent Out' is selected) */}
                {currentStatus === "Lent Out" && (
                  <div className="rounded-xl border border-border-neutral/80 bg-buttercream/80 p-3 animate-in fade-in duration-200">
                    <label
                      htmlFor="borrower-select"
                      className="block font-mono text-[10px] font-bold uppercase tracking-wider text-french-navy mb-1.5"
                    >
                      Lent to which friend?
                    </label>

                    {friends.length === 0 ? (
                      <div className="text-center py-2">
                        <p className="text-[11px] text-muted">
                          You have no connected friends yet.
                        </p>
                        <Link
                          href="/sharedrobe"
                          className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-dusty-lilac hover:text-french-navy transition"
                        >
                          <Users size={11} /> Find friends in ShareDrobe →
                        </Link>
                      </div>
                    ) : (
                      <select
                        id="borrower-select"
                        value={selectedBorrowerId || ""}
                        onChange={(e) =>
                          setSelectedBorrowerId(e.target.value || null)
                        }
                        className="w-full rounded-xl border border-border-neutral bg-white px-3 py-2 text-xs font-medium text-midnight-slate focus:border-french-navy focus:outline-hidden"
                      >
                        <option value="">-- Choose connected friend --</option>
                        {friends.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.fullName} ({f.email})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Save Status CTA (when status or borrower changed) */}
                {isStatusChanged && (
                  <button
                    type="button"
                    disabled={isPending && activeAction === "status"}
                    onClick={handleSaveStatus}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-french-navy py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                  >
                    {isPending && activeAction === "status" ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Updating Status...</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} strokeWidth={2.5} />
                        <span>Save Status</span>
                      </>
                    )}
                  </button>
                )}

                {/* LENDER CONTROLS: 'Ask for it back' OR 'Mark Returned & Resolve Drama' when item is Lent Out */}
                {item.status === "Lent Out" && (
                  <div className="pt-1 border-t border-border-neutral/70">
                    <div className="space-y-2.5 rounded-xl border border-dusty-lilac/40 bg-dusty-lilac/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-french-navy">
                            LENDER CONTROLS // ON LOAN
                          </p>
                          <p className="mt-0.5 truncate text-xs font-bold text-midnight-slate">
                            With {item.borrowerName || "a friend"} right now
                          </p>
                        </div>

                        {item.borrowedBy && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setIsNudgeModalOpen(true)}
                            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-french-navy px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                          >
                            <Megaphone size={13} className="text-dusty-lilac" />
                            <span>Ask for it back</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isPending && activeAction === "resolve_drama"}
                        onClick={handleResolveDrama}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                      >
                        {isPending && activeAction === "resolve_drama" ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>Resolving &amp; Marking Returned...</span>
                          </>
                        ) : (
                          <>
                            <Check size={13} strokeWidth={3} />
                            <span>🕊️ Mark Returned &amp; Resolve Drama</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-xl bg-white p-2.5">
                  <span className="text-xs font-bold text-midnight-slate">
                    {item.status}
                  </span>
                  <span className="text-[11px] text-muted">
                    Owner: {item.ownerName}
                  </span>
                </div>

                {item.status === "Lent Out" &&
                  item.borrowedBy === currentUserId && (
                    <button
                      type="button"
                      disabled={isPending && activeAction === "resolve_drama"}
                      onClick={handleResolveDrama}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                    >
                      {isPending && activeAction === "resolve_drama" ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Returning &amp; Resolving...</span>
                        </>
                      ) : (
                        <>
                          <Check size={13} strokeWidth={3} />
                          <span>🕊️ Confirm Returned &amp; Resolve Drama</span>
                        </>
                      )}
                    </button>
                  )}
              </div>
            )}
          </section>

          {/* SECTION 2: INTERACTIVE STYLE TAG SELECTOR */}
          <section className="rounded-2xl border border-border-neutral bg-chalk p-3.5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                STYLE & AESTHETIC TAGS
              </span>
              {isOwner && (
                <span className="font-mono text-[9px] text-dusty-lilac font-bold">
                  {selectedTags.length} selected
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALLOWED_ITEM_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={!isOwner}
                    onClick={() => handleToggleTag(tag)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium transition active:scale-95",
                      isSelected
                        ? "border-french-navy bg-french-navy text-white shadow-2xs font-bold"
                        : "border-border-neutral bg-white text-muted hover:border-dusty-lilac hover:text-midnight-slate",
                      !isOwner && "cursor-default opacity-80"
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            {/* Save Tags CTA (visible when tags modified) */}
            {isOwner && areTagsChanged && (
              <button
                type="button"
                disabled={isPending && activeAction === "tags"}
                onClick={handleSaveTags}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl bg-french-navy py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
              >
                {isPending && activeAction === "tags" ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving Tags...</span>
                  </>
                ) : (
                  <>
                    <Tag size={13} />
                    <span>Save Tag Changes</span>
                  </>
                )}
              </button>
            )}
          </section>

          {/* SECTION 3: PROMINENT OWNER ACTIONS (Duplicate / Delete) OR BORROW REQUEST BUTTON (Non-Owner) */}
          {isOwner ? (
            <section className="pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsDuplicateModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-2xl border border-dusty-lilac/40 bg-dusty-lilac/10 p-3 text-xs font-bold text-french-navy shadow-2xs transition hover:bg-dusty-lilac/20 hover:border-dusty-lilac active:scale-95"
              >
                <Copy size={14} className="text-dusty-lilac" />
                <span>Duplicate Item</span>
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-100 hover:border-rose-300 active:scale-95"
              >
                <Trash2 size={14} />
                <span>Delete Garment from Closet</span>
              </button>
            </section>
          ) : (
            <section className="pt-2">
              {hasRequestedBorrow ? (
                <div className="flex flex-col gap-2.5 rounded-2xl border border-dusty-lilac bg-dusty-lilac/15 p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={16} className="shrink-0 text-dusty-lilac" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-french-navy">
                        Borrow Request Pending ✨
                      </p>
                      {initialPendingBorrowRequest?.durationIntent && (
                        <p className="truncate font-mono text-[10px] font-semibold text-dusty-lilac">
                          ⏳ &ldquo;{initialPendingBorrowRequest.durationIntent}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isPending && activeAction === "cancel_borrow"}
                    onClick={handleCancelBorrowRequest}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                  >
                    {isPending && activeAction === "cancel_borrow" ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <X size={13} strokeWidth={2.5} />
                        <span>Cancel Request</span>
                      </>
                    )}
                  </button>
                </div>
              ) : item.status === "Available" && borrowCircle ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsBorrowModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-french-navy p-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                >
                  <Sparkles size={15} className="text-dusty-lilac" />
                  <span>Request to Borrow Item</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border-neutral bg-chalk p-3.5 text-xs font-bold text-muted shadow-2xs cursor-not-allowed"
                >
                  <Clock size={15} />
                  <span>
                    {item.borrowedBy === currentUserId
                      ? "You're Currently Borrowing This Piece ✨"
                      : `Currently ${item.status} — Cannot Borrow Right Now`}
                  </span>
                </button>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Persistent Bottom Nav Docked as Part of the Screen */}
      <BottomNav />
    </main>

      {/* BORROW REQUEST MODAL (Non-owner viewing item from a circle) */}
      {borrowCircle && (
        <BorrowRequestModal
          isOpen={isBorrowModalOpen}
          onClose={() => setIsBorrowModalOpen(false)}
          item={{
            id: item.id,
            title: item.title,
            category: item.category,
            image_url: item.imageUrl,
            owner_id: item.ownerId,
            ownerName: item.ownerName,
            status: item.status,
          }}
          circleId={borrowCircle.id}
          circleName={borrowCircle.name}
          onSuccess={(message) => {
            setHasRequestedBorrow(true);
            showFeedback("success", message);
            router.refresh();
          }}
        />
      )}

      {/* LENDER CONTROLS MODAL: 'Keep it Private (Email)' vs 'Create Drama (Public Call-out)' */}
      {isNudgeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nudge-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-slate/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div className="relative flex w-full max-w-md flex-col rounded-t-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl sm:rounded-[28px] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 rounded-md bg-dusty-lilac/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-french-navy">
                  <Megaphone className="h-3 w-3 text-dusty-lilac" />
                  CLOSET RETRIEVAL // ASK FOR IT BACK
                </span>
                <h3
                  id="nudge-modal-title"
                  className="mt-1.5 text-lg font-extrabold text-midnight-slate"
                >
                  Want &ldquo;{item.title}&rdquo; back?
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Choose your vibe for nudging{" "}
                  <strong className="text-midnight-slate">
                    {item.borrowerName || "your friend"}
                  </strong>
                  :
                </p>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsNudgeModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border-neutral bg-chalk text-muted transition hover:text-midnight-slate disabled:opacity-50"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {/* Option 1: Keep it Private (Email) */}
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleNudgeReturn("private")}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-border-strong bg-chalk p-3.5 text-left transition hover:border-french-navy hover:bg-white active:scale-99 disabled:opacity-50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-french-navy text-white shadow-xs transition group-hover:scale-105">
                  {isPending && activeAction === "nudge_private" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Mail size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-midnight-slate">
                    Keep it Private (Email) 💌
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted leading-snug">
                    Sends a sweet, low-key email reminder just between the two
                    of you. Zero public embarrassment.
                  </p>
                </div>
              </button>

              {/* Option 2: Create Drama (Public Call-out) */}
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleNudgeReturn("public")}
                className="group flex w-full items-center gap-3.5 rounded-2xl border-2 border-dusty-lilac bg-dusty-lilac p-3.5 text-left text-white shadow-md transition hover:brightness-95 active:scale-99 disabled:opacity-50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-french-navy text-amber-300 shadow-xs transition group-hover:scale-105">
                  {isPending && activeAction === "nudge_public" ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    <Siren size={19} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-white">
                    Create Drama (Public Call-out) 🚨
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/90 leading-snug">
                    Blasts a bold siren card directly into the Circle Drama Feed
                    calling out {item.borrowerName?.split(" ")[0] || "them"} in
                    front of the squad!
                  </p>
                </div>
              </button>
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsNudgeModalOpen(false)}
              className="mt-4 w-full rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold text-muted transition hover:text-midnight-slate disabled:opacity-50"
            >
              Let them keep rocking it for now
            </button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-slate/40 backdrop-blur-xs"
        >
          <div className="relative flex w-full max-w-[380px] flex-col rounded-[28px] border border-border-neutral bg-buttercream p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <Trash2 size={20} />
            </div>

            <h3 className="mt-3 text-base font-bold text-midnight-slate">
              Delete &ldquo;{item.title}&rdquo;?
            </h3>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              This action permanently removes this garment from your wardrobe, deletes
              its photo from cloud storage, and unshares it from any circles. This cannot
              be undone.
            </p>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                disabled={isPending && activeAction === "delete"}
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold uppercase tracking-wider text-muted transition hover:bg-border-neutral hover:text-midnight-slate active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending && activeAction === "delete"}
                onClick={handleConfirmDelete}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {isPending && activeAction === "delete" ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Item Confirmation Modal */}
      {isDuplicateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-slate/40 backdrop-blur-xs"
        >
          <div className="relative flex w-full max-w-[380px] flex-col rounded-[28px] border border-border-neutral bg-buttercream p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border-neutral">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-dusty-lilac/15 text-dusty-lilac">
                  <Copy size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-french-navy">
                    Duplicate Garment
                  </h3>
                  <p className="font-mono text-[10px] text-muted">
                    CLOSET // CLONE
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDuplicateModalOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-chalk hover:text-midnight-slate"
              >
                <X size={16} />
              </button>
            </div>

            <div className="py-4">
              <p className="text-xs text-graphite leading-relaxed">
                Do you want to upload a duplicate photo?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDuplicateConfirm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-french-navy py-2.5 text-xs font-bold text-white shadow-xs hover:bg-french-navy-hover active:scale-95 transition"
              >
                <Check size={14} />
                <span>Yes, Keep Existing Photo</span>
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateConfirm(false)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold text-french-navy hover:bg-border-neutral active:scale-95 transition"
              >
                <Camera size={14} className="text-dusty-lilac" />
                <span>No, Upload New Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
