"use client";

import React, { useState, useRef, KeyboardEvent } from "react";
import Image from "next/image";
import { Camera, X, Loader2 } from "lucide-react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ["Top", "Bottom", "Dress", "Accessories", "Fav Outfit"] as const;

export default function AddItemModal({ isOpen, onClose, onSuccess }: AddItemModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    try {
      const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1200, useWebWorker: true };
      const compressedFile = await imageCompression(selected, options);
      setFile(compressedFile);
      setPreview(URL.createObjectURL(compressedFile));
      setError("");
    } catch {
      setError("Failed to process image.");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return setError("Please provide an image and a title.");
    setIsSubmitting(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userId = user?.id;
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = userId ? `${userId}/${fileName}` : `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("wardrobe")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("wardrobe").getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("items").insert({
        title,
        category,
        tags,
        image_url: publicUrl,
        owner_id: userId,
      });
      if (dbError) throw dbError;

      setFile(null);
      setPreview(null);
      setTitle("");
      setTags([]);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-slate/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-border-neutral bg-buttercream p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border-neutral pb-4">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
              DIRECTORY // ADD_ITEM
            </span>
            <h2 className="text-xl font-bold tracking-tight text-french-navy">Add to Wardrobe</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted hover:text-midnight-slate transition"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex h-52 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border-strong bg-chalk transition hover:border-dusty-lilac"
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
              <div className="flex flex-col items-center gap-2 text-muted group-hover:text-french-navy transition">
                <Camera size={36} className="text-dusty-lilac" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Tap to snap or upload photo
                </span>
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

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-french-navy">
              Item Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Linen Summer Dress"
              className="mt-1 w-full rounded-xl border border-border-strong bg-chalk px-4 py-2.5 text-sm font-semibold text-midnight-slate focus:border-french-navy focus:outline-none"
            />
          </div>

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

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-french-navy">
              Tags
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
              placeholder="Type tag and press Enter..."
              className="w-full rounded-xl border border-border-strong bg-chalk px-4 py-2.5 text-sm font-semibold text-midnight-slate focus:border-french-navy focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !file || !title}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-french-navy py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-french-navy-hover disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Uploading...
              </>
            ) : (
              "Save to Closet Database"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
