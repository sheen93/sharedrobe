"use client";

import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import Image from "next/image";
import {
  Camera,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";
import {
  type FormError,
  type ValidEnumCategory,
  VALID_ENUM_CATEGORIES,
  isValidCategory,
  resolveSessionError,
  resolveStorageError,
  resolveDatabaseError,
} from "@/utils/upload-errors";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Category options adhering strictly to the PostgreSQL enum `item_category` values:
 * Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Accessories.
 */
const CATEGORY_OPTIONS: {
  value: ValidEnumCategory;
  label: string;
  hint: string;
}[] = [
  { value: "Tops", label: "Tops", hint: "Shirts, blouses, knitwear, tees" },
  { value: "Bottoms", label: "Bottoms", hint: "Jeans, trousers, skirts, shorts" },
  { value: "Dresses", label: "Dresses", hint: "Midi, maxi, cocktail, jumpsuits" },
  { value: "Outerwear", label: "Outerwear", hint: "Coats, jackets, blazers, vests" },
  { value: "Shoes", label: "Shoes", hint: "Boots, sneakers, heels, flats" },
  { value: "Bags", label: "Bags", hint: "Totes, shoulder bags, clutches" },
  { value: "Accessories", label: "Accessories", hint: "Jewelry, scarves, belts, hats" },
];

export interface DraftItem {
  id: string;
  file: File | null;
  previewUrl: string;
  existingImageUrl?: string | null;
  title: string;
  category: ValidEnumCategory;
  tags: string[];
  isSharable: boolean;
}

type UploadStep = "idle" | "uploading_storage" | "saving_db";

export default function AddItemModal({
  isOpen,
  onClose,
  onSuccess,
}: AddItemModalProps) {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);

  // Default / Sticky state
  const [defaultCategory, setDefaultCategory] = useState<ValidEnumCategory>(
    VALID_ENUM_CATEGORIES[0]
  );
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [defaultTitle, setDefaultTitle] = useState("");
  const [defaultIsSharable, setDefaultIsSharable] = useState(true);

  // Tag input for current active draft
  const [tagInput, setTagInput] = useState("");

  // Touch gesture support for swipeable cards
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Initialize from duplicate state or sticky defaults when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      // 1. Check for Duplicate Item payload
      try {
        const duplicateRaw = localStorage.getItem("sharedrobe_duplicate_item");
        if (duplicateRaw) {
          const dup = JSON.parse(duplicateRaw);
          localStorage.removeItem("sharedrobe_duplicate_item");

          const targetCategory = (
            isValidCategory(dup.category) ? dup.category : VALID_ENUM_CATEGORIES[0]
          ) as ValidEnumCategory;
          const targetTags = Array.isArray(dup.tags) ? dup.tags : [];
          const targetTitle = typeof dup.title === "string" ? dup.title : "";
          const targetSharable = dup.is_sharable !== false;

          setDefaultCategory(targetCategory);
          setDefaultTags(targetTags);
          setDefaultTitle(targetTitle);
          setDefaultIsSharable(targetSharable);

          if (dup.imageUrl) {
            // 'Yes' branch: pass existing image URL to upload state
            const dupDraft: DraftItem = {
              id: `dup-${Date.now()}`,
              file: null,
              previewUrl: dup.imageUrl,
              existingImageUrl: dup.imageUrl,
              title: targetTitle || "Duplicate Garment",
              category: targetCategory,
              tags: targetTags,
              isSharable: targetSharable,
            };
            setDrafts([dupDraft]);
            setActiveIndex(0);
            return;
          } else {
            // 'No' branch: pre-fill category/tags/sharable, require new photo
            setDrafts([]);
            setActiveIndex(0);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not parse duplicate item from localStorage:", e);
      }

      // 2. Check for Sticky Defaults if no duplicate payload was found
      try {
        const stickyRaw = localStorage.getItem("sharedrobe_sticky_defaults");
        if (stickyRaw) {
          const sticky = JSON.parse(stickyRaw);
          if (sticky.category && isValidCategory(sticky.category)) {
            setDefaultCategory(sticky.category);
          }
          if (Array.isArray(sticky.tags)) {
            setDefaultTags(sticky.tags);
          }
        }
      } catch (e) {
        console.warn("Could not parse sticky defaults from localStorage:", e);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDraft = drafts[activeIndex] || null;

  // Multi-file selection handler with client-side compression
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setFormError(null);
    setIsCompressing(true);

    const newDrafts: DraftItem[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const rawFile = selectedFiles[i];
      let compressed = rawFile;
      try {
        const options = {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        };
        compressed = await imageCompression(rawFile, options);
      } catch {
        compressed = rawFile;
      }

      // Keep items in in-memory React state using URL.createObjectURL()
      const previewUrl = URL.createObjectURL(compressed);

      newDrafts.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        file: compressed,
        previewUrl,
        existingImageUrl: null,
        title:
          newDrafts.length === 0 && drafts.length === 0 && defaultTitle
            ? defaultTitle
            : "",
        category: defaultCategory,
        tags: [...defaultTags],
        isSharable: defaultIsSharable,
      });
    }

    setDrafts((prev) => [...prev, ...newDrafts]);
    setIsCompressing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Helper to update fields on the current active draft
  const updateCurrentDraft = (fields: Partial<DraftItem>) => {
    if (!currentDraft) return;
    setDrafts((prev) =>
      prev.map((d, idx) => (idx === activeIndex ? { ...d, ...fields } : d))
    );
  };

  // Tag addition for current draft
  const handleKeyDownTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const cleanTag = tagInput.trim().toLowerCase().replace(/^#/, "");
      if (cleanTag && currentDraft && !currentDraft.tags.includes(cleanTag)) {
        updateCurrentDraft({ tags: [...currentDraft.tags, cleanTag] });
      }
      setTagInput("");
    }
  };

  const removeTagFromCurrentDraft = (tagToRemove: string) => {
    if (!currentDraft) return;
    updateCurrentDraft({
      tags: currentDraft.tags.filter((t) => t !== tagToRemove),
    });
  };

  // Remove a draft from the in-memory array
  const handleRemoveDraft = (indexToRemove: number) => {
    const draftToRemove = drafts[indexToRemove];
    if (draftToRemove?.file && draftToRemove.previewUrl) {
      URL.revokeObjectURL(draftToRemove.previewUrl);
    }

    setDrafts((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (activeIndex >= updated.length) {
        setActiveIndex(Math.max(0, updated.length - 1));
      }
      return updated;
    });
  };

  // Reset form and revoke all allocated object URLs
  const resetForm = () => {
    drafts.forEach((d) => {
      if (d.file && d.previewUrl) {
        URL.revokeObjectURL(d.previewUrl);
      }
    });
    setDrafts([]);
    setActiveIndex(0);
    setFormError(null);
    setUploadStep("idle");
    setUploadProgress(null);
    setTagInput("");
  };

  const handleClose = () => {
    if (uploadStep !== "idle") return; // Prevent closing mid-upload
    resetForm();
    onClose();
  };

  // Touch handlers for swipeable card iteration
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    if (diff > 50 && activeIndex < drafts.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else if (diff < -50 && activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
    setTouchStartX(null);
  };

  // Final Submit Handler: Uploads all in-memory drafts to storage and database
  const handleUploadAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (drafts.length === 0) {
      setFormError({
        type: "no_file",
        message:
          "Please select at least one garment photo before uploading.",
      });
      return;
    }

    // Validate that all drafts have titles and valid categories
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      if (!d.title || !d.title.trim()) {
        setActiveIndex(i);
        setFormError({
          type: "no_title",
          message: `Please enter a name for garment #${i + 1} (${d.category}).`,
        });
        return;
      }
      if (!isValidCategory(d.category)) {
        setActiveIndex(i);
        setFormError({
          type: "enum_violation",
          message: `Invalid clothing category for garment #${i + 1}.`,
        });
        return;
      }
    }

    try {
      setUploadStep("uploading_storage");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      const sessionError = resolveSessionError(user, authError);
      if (sessionError || !user) {
        setFormError(sessionError);
        setUploadStep("idle");
        return;
      }

      const userId = user.id;

      // Iterate and upload each draft sequentially
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        setUploadProgress({ current: i + 1, total: drafts.length });

        let finalImageUrl = d.existingImageUrl || "";

        // Upload file to Supabase storage if file is present
        if (d.file) {
          const fileExt = d.file.name.split(".").pop() || "jpg";
          const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const fileName = `${uniqueSuffix}.${fileExt}`;
          const filePath = `${userId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("wardrobe")
            .upload(filePath, d.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            const storageError = resolveStorageError(uploadError);
            setFormError(storageError);
            setUploadStep("idle");
            return;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("wardrobe").getPublicUrl(filePath);
          finalImageUrl = publicUrl;
        }

        // Insert garment record with plural Postgres enum `item_category`
        setUploadStep("saving_db");
        const { error: dbError } = await supabase.from("items").insert({
          title: d.title.trim(),
          category: d.category,
          tags: d.tags,
          image_url: finalImageUrl,
          owner_id: userId,
          is_sharable: d.isSharable,
        });

        if (dbError) {
          const databaseError = resolveDatabaseError(dbError);
          setFormError(databaseError);
          setUploadStep("idle");
          return;
        }
      }

      // Sticky Defaults: Save last uploaded category and tags to localStorage
      const lastDraft = drafts[drafts.length - 1];
      if (lastDraft) {
        try {
          localStorage.setItem(
            "sharedrobe_sticky_defaults",
            JSON.stringify({
              category: lastDraft.category,
              tags: lastDraft.tags,
            })
          );
        } catch (storageErr) {
          console.warn("Could not persist sticky defaults:", storageErr);
        }
      }

      // Revoke in-memory object URLs
      drafts.forEach((d) => {
        if (d.file && d.previewUrl) {
          URL.revokeObjectURL(d.previewUrl);
        }
      });

      resetForm();
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during bulk garment upload.";
      setFormError({
        type: "generic",
        message,
      });
      setUploadStep("idle");
    }
  };

  const isSubmitting = uploadStep !== "idle";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-slate/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-border-neutral bg-buttercream p-6 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-neutral pb-4">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
              DIRECTORY // BULK_UPLOAD
            </span>
            <h2 className="text-xl font-bold tracking-tight text-midnight-slate">
              {drafts.length > 1
                ? `Add ${drafts.length} Garments`
                : "Add to Closet"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-muted transition-colors hover:bg-chalk hover:text-midnight-slate active:scale-95 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Boundary Notification */}
        {formError && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-900 shadow-2xs">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="font-semibold">{formError.message}</p>
            </div>
          </div>
        )}

        {/* Hidden Multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
          disabled={isSubmitting || isCompressing}
        />

        {/* STATE 1: Empty Drafts (Initial File Picker) */}
        {drafts.length === 0 ? (
          <div className="py-6 flex flex-col items-center justify-center gap-4 text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCompressing}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-strong bg-chalk/50 p-8 text-center transition-colors hover:border-dusty-lilac hover:bg-chalk active:scale-98"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dusty-lilac/15 text-dusty-lilac shadow-xs">
                {isCompressing ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <Camera size={26} />
                )}
              </div>
              <p className="mt-4 text-sm font-bold text-french-navy">
                {isCompressing
                  ? "Optimizing photos..."
                  : "Tap to select photos"}
              </p>
              <p className="mt-1 text-xs text-muted max-w-xs">
                Select one or multiple photos from your camera roll. Everything
                stays safely in memory until you hit submit.
              </p>
            </button>

            {defaultTags.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <Sparkles size={12} className="text-dusty-lilac" />
                <span>Sticky defaults active ({defaultCategory})</span>
              </div>
            )}
          </div>
        ) : (
          /* STATE 2: Swipeable Multi-Item Editor */
          <div className="flex flex-col gap-4 py-4">
            {/* Top Navigation & Thumbnail Strip */}
            <div className="flex items-center justify-between border-b border-border-neutral/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-french-navy">
                  Item {activeIndex + 1} of {drafts.length}
                </span>
                <span className="rounded-md bg-dusty-lilac/15 px-2 py-0.5 font-mono text-[10px] font-bold text-dusty-lilac">
                  {currentDraft?.category}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 rounded-xl border border-border-neutral bg-chalk px-2.5 py-1 text-xs font-bold text-french-navy hover:bg-border-neutral active:scale-95 transition"
                >
                  <Plus size={12} />
                  <span>Add More</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveDraft(activeIndex)}
                  className="rounded-xl border border-rose-200 bg-rose-50/70 p-1.5 text-rose-600 hover:bg-rose-100 transition active:scale-95"
                  title="Remove this draft"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Thumbnail Pills Carousel Strip */}
            {drafts.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
                {drafts.map((d, idx) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`relative shrink-0 h-11 w-11 rounded-xl overflow-hidden border-2 transition ${
                      idx === activeIndex
                        ? "border-dusty-lilac shadow-xs scale-105"
                        : "border-border-neutral opacity-60 hover:opacity-100"
                    }`}
                  >
                    <Image
                      src={d.previewUrl}
                      alt={`Draft ${idx + 1}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Swipeable Item Card */}
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="relative flex flex-col gap-4 rounded-2xl border border-border-neutral bg-chalk/30 p-4"
            >
              {/* Desktop / Prev / Next Chevrons */}
              {drafts.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex(activeIndex - 1)}
                    className="absolute left-2 top-28 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-midnight-slate/70 text-white shadow-md backdrop-blur-xs transition hover:bg-midnight-slate disabled:opacity-0 pointer-events-auto"
                    aria-label="Previous garment"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex === drafts.length - 1}
                    onClick={() => setActiveIndex(activeIndex + 1)}
                    className="absolute right-2 top-28 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-midnight-slate/70 text-white shadow-md backdrop-blur-xs transition hover:bg-midnight-slate disabled:opacity-0 pointer-events-auto"
                    aria-label="Next garment"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}

              {/* Image Preview Container */}
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-border-neutral bg-chalk">
                {currentDraft?.previewUrl && (
                  <Image
                    src={currentDraft.previewUrl}
                    alt={currentDraft.title || "Garment preview"}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}
                {currentDraft?.existingImageUrl && (
                  <span className="absolute bottom-2 left-2 rounded-lg bg-midnight-slate/80 px-2 py-1 font-mono text-[9px] font-bold text-buttercream backdrop-blur-xs">
                    Existing Photo
                  </span>
                )}
              </div>

              {/* Garment Title Input */}
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold uppercase text-muted">
                  Item Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={currentDraft?.title || ""}
                  onChange={(e) =>
                    updateCurrentDraft({ title: e.target.value })
                  }
                  placeholder="e.g., Oversized Linen Blazer"
                  className="w-full rounded-xl border border-border-strong bg-buttercream px-3.5 py-2.5 text-xs font-semibold text-french-navy placeholder:text-muted/60 focus:border-dusty-lilac focus:outline-hidden"
                  disabled={isSubmitting}
                />
              </div>

              {/* Category Selector */}
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold uppercase text-muted">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={currentDraft?.category || defaultCategory}
                  onChange={(e) =>
                    updateCurrentDraft({
                      category: e.target.value as ValidEnumCategory,
                    })
                  }
                  className="w-full rounded-xl border border-border-strong bg-buttercream px-3.5 py-2.5 text-xs font-semibold text-french-navy focus:border-dusty-lilac focus:outline-hidden"
                  disabled={isSubmitting}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.hint}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags Input */}
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold uppercase text-muted">
                  Tags (Press Enter or comma)
                </label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDownTag}
                  placeholder="e.g., vintage, casual, silk"
                  className="w-full rounded-xl border border-border-strong bg-buttercream px-3.5 py-2 text-xs font-semibold text-french-navy placeholder:text-muted/60 focus:border-dusty-lilac focus:outline-hidden"
                  disabled={isSubmitting}
                />
                {currentDraft?.tags && currentDraft.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {currentDraft.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-lg border border-border-neutral bg-buttercream px-2 py-0.5 text-[11px] font-bold text-french-navy"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => removeTagFromCurrentDraft(t)}
                          className="hover:text-rose-600"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Shareable in Circles Toggle */}
              <label className="flex items-center justify-between rounded-xl border border-border-neutral bg-buttercream p-3 cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-french-navy">
                    Shareable in Circles
                  </p>
                  <p className="text-[10px] text-muted">
                    Allow circle besties to discover and borrow this piece
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={currentDraft?.isSharable ?? true}
                  onChange={(e) =>
                    updateCurrentDraft({ isSharable: e.target.checked })
                  }
                  className="h-4 w-4 accent-dusty-lilac rounded"
                  disabled={isSubmitting}
                />
              </label>
            </div>

            {/* Upload All Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleUploadAll}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-french-navy py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>
                      {uploadStep === "uploading_storage"
                        ? `Uploading ${uploadProgress?.current || 1} of ${uploadProgress?.total || drafts.length}...`
                        : "Saving to closet..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>
                      Upload All ({drafts.length}{" "}
                      {drafts.length === 1 ? "Piece" : "Pieces"})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
