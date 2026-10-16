"use client";

import React, { useState, useTransition } from "react";
import { X, Users, Sparkles, Loader2 } from "lucide-react";
import { createCircle } from "@/app/sharedrobe/actions";
import ScreenHeader from "@/components/ui/ScreenHeader";
import FieldCard from "@/components/ui/FieldCard";
import IconInput from "@/components/ui/IconInput";
import FormMessage from "@/components/ui/FormMessage";

interface CreateCircleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateCircleModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCircleModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Circle name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 50) {
      setError("Circle name cannot exceed 50 characters.");
      return;
    }

    startTransition(async () => {
      const result = await createCircle(trimmed, description.trim() || undefined);
      if (!result.success) {
        setError(result.error);
      } else {
        setName("");
        setDescription("");
        onSuccess();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-slate/40 backdrop-blur-xs"
    >
      <div className="relative flex w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-border-neutral bg-buttercream p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <ScreenHeader
          meta="COMMUNITY // CIRCLES"
          title="New Circle"
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

        {error && (
          <div className="mt-3">
            <FormMessage tone="error">{error}</FormMessage>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <FieldCard
            label="Circle Name"
            htmlFor="circle-name"
            meta="Required"
            helper="e.g., Roommates, Brooklyn Fashion Swap, Work Besties"
          >
            <IconInput
              id="circle-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend Gala Circle"
              icon={Users}
              disabled={isPending}
            />
          </FieldCard>

          <FieldCard
            label="Description"
            htmlFor="circle-desc"
            meta="Optional"
            helper="A short note explaining what wardrobe items to share."
          >
            <textarea
              id="circle-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Coats, cocktail dresses, and seasonal outerwear..."
              maxLength={250}
              rows={3}
              disabled={isPending}
              className="w-full resize-none rounded-xl border border-border-neutral bg-chalk p-3 text-xs text-midnight-slate placeholder:text-muted focus:border-dusty-lilac focus:outline-hidden"
            />
          </FieldCard>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold text-muted hover:text-midnight-slate transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-french-navy py-2.5 text-xs font-bold text-white shadow-sm hover:bg-french-navy-hover transition disabled:opacity-70"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Create Circle
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
