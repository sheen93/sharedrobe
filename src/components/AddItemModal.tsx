"use client";

import React, { useState, useRef, KeyboardEvent } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

export default function AddItemModal({ isOpen, onClose, onSuccess }: AddItemModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
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
    } catch (err) {
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

  const removeTag = (tagToRemove: string) => setTags(tags.filter(t => t !== tagToRemove));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return setError("Please provide an image and a title.");
    setIsSubmitting(true);
    setError("");

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('wardrobe').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('wardrobe').getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('items').insert({
        title, category, tags, image_url: publicUrl,
      });
      if (dbError) throw dbError;

      setFile(null); setPreview(null); setTitle(""); setTags([]); onSuccess();
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-charcoal/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-cream rounded-t-3xl sm:rounded-2xl p-6 shadow-xl border border-beige flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-4 border-b border-beige">
          <h2 className="text-xl font-bold text-charcoal">Add to Wardrobe</h2>
          <button onClick={onClose} className="p-1 rounded-full text-taupe hover:text-charcoal"><X size={20} /></button>
        </div>
        {error && <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
          <div onClick={() => fileInputRef.current?.click()} className="w-full h-56 bg-beige rounded-2xl border-2 border-dashed border-sage-light flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group">
            {preview ? <img src={preview} alt="Preview" className="w-full h-full object-cover" /> : (
              <div className="flex flex-col items-center gap-2 text-taupe group-hover:text-sage">
                <Camera size={36} /><span className="text-sm font-medium">Tap to snap or upload</span>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
          </div>

          <div>
            <label className="text-xs font-semibold text-taupe uppercase">Item Name</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Linen Summer Dress" className="w-full mt-1 px-4 py-3 bg-white border border-beige rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-sage" />
          </div>

          <div>
            <label className="text-xs font-semibold text-taupe uppercase">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 px-4 py-3 bg-white border border-beige rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-sage appearance-none">
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-taupe uppercase mb-1 block">Custom Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-beige text-charcoal text-xs font-medium rounded-full border border-sage-light">
                  #{tag} <button type="button" onClick={() => removeTag(tag)} className="hover:text-sage ml-0.5"><X size={12} /></button>
                </span>
              ))}
            </div>
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleKeyDownTag} placeholder="Type tag and press Enter..." className="w-full px-4 py-3 bg-white border border-beige rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage" />
          </div>

          <button type="submit" disabled={isSubmitting || !file || !title} className="w-full mt-2 py-3.5 bg-sage hover:bg-sage-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {isSubmitting ? <><Loader2 size={20} className="animate-spin" /> Uploading...</> : "Save to Closet"}
          </button>
        </form>
      </div>
    </div>
  );
}
