"use client";

import React, { useState, useRef, KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, X, Loader2, AlertCircle, LogIn, Sparkles } from "lucide-react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";
import {
  type FormError,
  validateUploadInputs,
  resolveSessionError,
  resolveStorageError,
  resolveDatabaseError,
} from "@/utils/upload-errors";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ["Top", "Bottom", "Dress", "Accessories", "Fav Outfit"] as const;

type UploadStep = "idle" | "compressing" | "uploading_storage" | "saving_db";

export default function AddItemModal({ isOpen, onClose, onSuccess }: AddItemModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [formError, setFormError] = useState<FormError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFormError(null);
    setUploadStep("compressing");

    try {
      const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1200, useWebWorker: true };
      const compressedFile = await imageCompression(selected, options);
      setFile(compressedFile);
      setPreview(URL.createObjectURL(compressedFile));
    } catch {
      // Fallback to original file if client-side compression fails
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    } finally {
      setUploadStep("idle");
    }
  };

  const handleKeyDownTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const cleanTag = tagInput.trim().toLowerCase().replace(/^#/, "");
      if (cleanTag && !tags.includes(cleanTag)) {
        setTags([...tags, cleanTag]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => setTags(tags.filter((t) => t !== tagToRemove));

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setTitle("");
    setCategory(CATEGORIES[0]);
    setTags([]);
    setTagInput("");
    setFormError(null);
    setUploadStep("idle");
  };

  const handleClose = () => {
    if (uploadStep !== "idle") return; // prevent closing while uploading
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Scenario 1: User attempts to upload without selecting a file or title
    const inputError = validateUploadInputs(file, title);
    if (inputError) {
      setFormError(inputError);
      return;
    }

    try {
      // Scenario 2: User session verification (Session expires mid-upload)
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
      const fileExt = file ? file.name.split(".").pop() || "jpg" : "jpg";
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const fileName = `${uniqueSuffix}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Scenario 3: Storage bucket upload and rejection handling
      const { error: uploadError } = await supabase.storage
        .from("wardrobe")
        .upload(filePath, file as File, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        const storageError = resolveStorageError(uploadError);
        setFormError(storageError);
        setUploadStep("idle");
        return;
      }

      // Extract Public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("wardrobe").getPublicUrl(filePath);

      // Scenario 4: Database insert with explicit owner_id and RLS handling
      setUploadStep("saving_db");
      const { error: dbError } = await supabase.from("items").insert({
        title: title.trim(),
        category,
        tags,
        image_url: publicUrl,
        owner_id: userId,
      });

      if (dbError) {
        const databaseError = resolveDatabaseError(dbError);
        setFormError(databaseError);
        setUploadStep("idle");
        return;
      }

      // Success
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred during item upload.";
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
              DIRECTORY // ADD_ITEM
            </span>
            <h2 className="text-xl font-bold tracking-tight text-french-navy">Add to Wardrobe</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-full p-1 text-muted transition hover:text-midnight-slate disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {/* Human-Readable Error Banners */}
        {formError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="font-semibold">{formError.message}</p>
              {formError.type === "session_expired" && (
                <div className="mt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1 rounded-lg bg-french-navy px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-french-navy-hover transition"
                  >
                    <LogIn size={12} /> Sign In to Continue
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* Photo Picker */}
          <div
            onClick={() => {
              if (!isSubmitting) fileInputRef.current?.click();
            }}
            className={`group relative flex h-52 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-chalk transition ${
              formError?.type === "no_file"
                ? "border-red-400 bg-red-50/40"
                : "border-border-strong hover:border-dusty-lilac"
            }`}
          >
            {preview ? (
              <Image
                src={preview}
                alt="Selected garment preview"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted transition group-hover:text-french-navy">
                <Camera size={36} className="text-dusty-lilac" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Tap to snap or select photo
                </span>
                <span className="text-[10px] text-muted">JPEG, PNG, WebP supported</span>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-french-navy">
              Item Name <span className="text-dusty-lilac">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError?.type === "no_title") setFormError(null);
              }}
              placeholder="e.g. Linen Summer Dress"
              className={`mt-1 w-full rounded-xl border bg-chalk px-4 py-2.5 text-sm font-semibold text-midnight-slate focus:border-french-navy focus:outline-none ${
                formError?.type === "no_title" ? "border-red-400" : "border-border-strong"
              }`}
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-french-navy">
              Category Folder
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-strong bg-chalk px-4 py-2.5 text-sm font-semibold text-midnight-slate focus:border-french-navy focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-french-navy">
              Custom Tags
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-border-neutral bg-chalk px-2.5 py-1 text-xs font-mono font-medium text-french-navy"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 text-muted hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDownTag}
              placeholder="Type tag and press Enter or comma..."
              className="w-full rounded-xl border border-border-strong bg-chalk px-4 py-2.5 text-sm font-semibold text-midnight-slate focus:border-french-navy focus:outline-none"
            />
          </div>

          {/* Submit Action with granular step feedback */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-french-navy py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-french-navy-hover active:scale-[0.99] disabled:opacity-60"
          >
            {uploadStep === "compressing" ? (
              <>
                <Loader2 size={16} className="animate-spin text-dusty-lilac" /> Compressing photo...
              </>
            ) : uploadStep === "uploading_storage" ? (
              <>
                <Loader2 size={16} className="animate-spin text-dusty-lilac" /> Uploading to storage...
              </>
            ) : uploadStep === "saving_db" ? (
              <>
                <Loader2 size={16} className="animate-spin text-dusty-lilac" /> Saving to closet database...
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-dusty-lilac" /> Save to Closet Database
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
