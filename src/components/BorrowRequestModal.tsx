"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Sparkles,
  X,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { createBorrowRequest } from "@/app/sharedrobe/actions";
import {
  BORROW_DURATION_OPTIONS,
  type BorrowDurationOption,
} from "@/app/sharedrobe/constants";
import { cn } from "@/utils/cn";

export interface BorrowModalItem {
  id: string;
  title: string;
  category: string;
  image_url: string;
  owner_id: string;
  ownerName: string;
  status: string;
}

interface BorrowRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BorrowModalItem | null;
  circleId: string;
  circleName: string;
  onSuccess?: (message: string, itemId: string, duration: string) => void;
}

export default function BorrowRequestModal({
  isOpen,
  onClose,
  item,
  circleId,
  circleName,
  onSuccess,
}: BorrowRequestModalProps) {
  const [durationIntent, setDurationIntent] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen || !item) return null;

  const handleClose = () => {
    if (isPending) return;
    setDurationIntent("");
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = durationIntent.trim();
    if (
      !trimmed ||
      !(BORROW_DURATION_OPTIONS as readonly string[]).includes(trimmed)
    ) {
      setErrorMessage(
        "Hold up! Pick how long you're planning to borrow this piece first."
      );
      return;
    }

    startTransition(async () => {
      const result = await createBorrowRequest(
        item.id,
        circleId,
        trimmed as BorrowDurationOption
      );

      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      const finalDuration = trimmed;
      setDurationIntent("");
      setErrorMessage(null);
      if (onSuccess) {
        onSuccess(result.message, item.id, finalDuration);
      }
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="borrow-request-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-slate/60 p-0 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in duration-150"
    >
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl sm:rounded-3xl">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1 rounded-md bg-dusty-lilac/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-french-navy">
              <Sparkles className="h-3 w-3 text-dusty-lilac" />
              CALL DIBS // {circleName}
            </span>
            <h2
              id="borrow-request-modal-title"
              className="mt-1.5 text-lg font-extrabold tracking-tight text-midnight-slate"
            >
              Borrow from {item.ownerName.split(" ")[0]}&apos;s Closet ✨
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-neutral bg-chalk text-muted transition hover:text-midnight-slate disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Garment Preview Card */}
        <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-border-neutral bg-chalk p-3 shadow-xs">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border-strong bg-buttercream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt={item.title}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-french-navy px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                {item.category}
              </span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800">
                Available
              </span>
            </div>
            <h3 className="mt-1 truncate text-sm font-bold text-midnight-slate">
              {item.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              Owned by <strong className="text-midnight-slate">{item.ownerName}</strong>
            </p>
            <Link
              href={`/items/${item.id}?from=/sharedrobe/${circleId}`}
              className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-french-navy underline-offset-2 hover:text-dusty-lilac hover:underline"
            >
              <span>Inspect full item details</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>

        {/* Borrow Request Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="borrow-duration-select"
              className="flex items-center justify-between text-xs font-bold text-midnight-slate"
            >
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-dusty-lilac" />
                How long are you borrowing this?
              </span>
              <span className="font-mono text-[10px] font-bold uppercase text-rose-600">
                * Mandatory
              </span>
            </label>

            <p className="mt-0.5 text-[11px] text-muted">
              Be honest with your bestie (or at least entertaining):
            </p>

            <select
              id="borrow-duration-select"
              required
              value={durationIntent}
              onChange={(e) => {
                setDurationIntent(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isPending}
              className={cn(
                "mt-2 w-full rounded-xl border bg-chalk px-3.5 py-3 text-xs font-semibold text-midnight-slate shadow-2xs transition focus:border-french-navy focus:bg-white focus:outline-none",
                !durationIntent
                  ? "border-border-strong text-muted"
                  : "border-french-navy bg-white text-midnight-slate"
              )}
            >
              <option value="" disabled>
                Select your borrow vibe...
              </option>
              {BORROW_DURATION_OPTIONS.map((option) => (
                <option
                  key={option}
                  value={option}
                  className="text-midnight-slate font-medium"
                >
                  {option}
                </option>
              ))}
            </select>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-border-strong bg-chalk py-3 text-xs font-bold text-midnight-slate transition hover:bg-border-neutral/40 disabled:opacity-50"
            >
              Nevermind
            </button>
            <button
              type="submit"
              disabled={isPending || !durationIntent}
              className="flex flex-[1.6] items-center justify-center gap-1.5 rounded-xl bg-french-navy py-3 text-xs font-bold text-white shadow-md transition hover:bg-french-navy-hover active:scale-98 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending Dibs...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 stroke-[2.5]" />
                  <span>Call Dibs & Request ✨</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
