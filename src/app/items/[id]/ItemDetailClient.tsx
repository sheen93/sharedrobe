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
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import FormMessage from "@/components/ui/FormMessage";
import { cn } from "@/utils/cn";
import {
  updateItemStatus,
  updateItemTags,
  deleteItem,
  ALLOWED_ITEM_STATUSES,
  ALLOWED_ITEM_TAGS,
  type ItemStatus,
} from "@/app/items/actions";

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
}

export default function ItemDetailClient({
  item,
  friends,
  isOwner,
}: ItemDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"status" | "tags" | "delete" | null>(
    null
  );

  // Status state
  const [currentStatus, setCurrentStatus] = useState<ItemStatus>(item.status);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string | null>(
    item.borrowedBy
  );

  // Tags state
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags);

  // Delete confirmation modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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

  // Delete Garment
  const handleConfirmDelete = () => {
    if (!isOwner || isPending) return;

    setActiveAction("delete");
    startTransition(async () => {
      const res = await deleteItem(item.id, item.imageUrl);
      setActiveAction(null);

      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push("/");
      } else {
        showFeedback("error", res.error);
        setIsDeleteModalOpen(false);
      }
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-linen sm:p-6 lg:p-8">
      <main className="flex w-full max-w-md flex-1 flex-col bg-buttercream p-4 pb-28 sm:rounded-[32px] sm:border sm:border-border-neutral sm:p-5 sm:shadow-2xl">
        {/* Screen Header with back link */}
        <header className="flex items-center justify-between border-b border-border-neutral px-1 pt-1 pb-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-french-navy transition hover:bg-border-neutral active:scale-95"
              aria-label="Back to wardrobe"
            >
              <ArrowLeft size={16} />
            </Link>
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
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-white p-2.5">
                <span className="text-xs font-bold text-midnight-slate">
                  {item.status}
                </span>
                <span className="text-[11px] text-muted">
                  Owner: {item.ownerName}
                </span>
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

          {/* SECTION 3: PROMINENT DELETE SECTION (Owner only) */}
          {isOwner && (
            <section className="pt-2">
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
          )}
        </div>
      </main>

      {/* Persistent Bottom Nav */}
      <BottomNav />

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
    </div>
  );
}
