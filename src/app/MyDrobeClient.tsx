"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Database, Shirt, Tag, Sparkles, Share2, Check } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AddItemModal from "@/components/AddItemModal";
import ShareItemModal from "@/components/ShareItemModal";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";

export const CATEGORIES = [
  "All",
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Bags",
  "Accessories",
] as const;

export interface WardrobeItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  image_url: string;
  owner_id?: string;
  created_at?: string;
  sharedCirclesCount?: number;
}

interface MyDrobeClientProps {
  initialItems: WardrobeItem[];
  userId: string;
}

export default function MyDrobeClient({ initialItems: items }: MyDrobeClientProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemToShare, setSelectedItemToShare] = useState<WardrobeItem | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleItemAdded = () => {
    setIsModalOpen(false);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleOpenShare = (item: WardrobeItem) => {
    setSelectedItemToShare(item);
    setIsShareModalOpen(true);
  };

  const handleShareSuccess = (count: number, itemTitle: string) => {
    setIsShareModalOpen(false);
    setShareFeedback(
      count > 0
        ? `"${itemTitle}" shared to ${count} ${count === 1 ? "circle" : "circles"}!`
        : `"${itemTitle}" is already shared in your circles.`
    );
    setTimeout(() => {
      setShareFeedback(null);
    }, 4000);
    startTransition(() => {
      router.refresh();
    });
  };

  const filteredItems =
    activeCategory === "All"
      ? items
      : items.filter((i) => {
          if (!i.category) return false;
          const itemCat = i.category.toLowerCase().trim();
          const activeCat = activeCategory.toLowerCase().trim();
          return (
            itemCat === activeCat ||
            itemCat.replace(/s$/, "") === activeCat.replace(/s$/, "")
          );
        });

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      {/* Responsive App Shell: Full-width on mobile devices, centered card on desktops */}
      <main className="flex w-full max-w-md flex-1 flex-col bg-buttercream p-4 pb-28 sm:rounded-[32px] sm:border sm:border-border-neutral sm:p-5 sm:shadow-2xl">
        {/* Screen Header */}
        <ScreenHeader
          meta="DIRECTORY // MY_DROBE"
          title="MyDrobe"
          action={
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-french-navy text-white shadow-md transition active:scale-95 hover:bg-french-navy-hover"
              title="Add clothing to database"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </button>
          }
        />

        {/* Database stats badge */}
        <InfoBar
          icon={Database}
          label="5 Categorized Folders"
          detail={
            isPending ? (
              <span className="flex items-center gap-1 font-mono text-[11px] text-dusty-lilac">
                <Sparkles size={11} className="animate-spin" /> Syncing...
              </span>
            ) : (
              `${items.length} ${items.length === 1 ? "Item" : "Items"} Total`
            )
          }
          className="mt-3"
        />

        {/* Success toast / feedback banner */}
        {shareFeedback && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-900 animate-in fade-in duration-200">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{shareFeedback}</span>
          </div>
        )}

        {/* Category Pills (horizontal scroll) */}
        <div className="hide-scrollbar -mx-1 mt-3.5 flex gap-1.5 overflow-x-auto px-1 py-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition ${
                  isActive
                    ? "bg-french-navy text-white shadow-sm"
                    : "border border-border-neutral bg-chalk text-muted hover:text-midnight-slate"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Wardrobe Items Display */}
        <div className="mt-4 flex-1">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                <Shirt className="h-6 w-6 stroke-[2]" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                {activeCategory === "All"
                  ? "Your closet database is empty"
                  : `No items in ${activeCategory}`}
              </h3>
              <p className="mt-1 text-xs text-muted">
                Tap the + button above to upload garments to your personal wardrobe.
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-french-navy-hover"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border-neutral bg-chalk shadow-xs transition hover:shadow-md"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-buttercream">
                    <Image
                      src={item.image_url}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2 rounded-md border border-border-neutral bg-buttercream/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-french-navy backdrop-blur-xs">
                      {item.category}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-xs font-bold text-midnight-slate">
                      {item.title}
                    </h3>
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 rounded-md border border-border-neutral bg-buttercream px-1.5 py-0.5 font-mono text-[9px] text-muted"
                          >
                            <Tag size={8} /> #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Share to Circle Trigger & Status */}
                    <div className="mt-2.5 flex items-center justify-between border-t border-border-neutral/60 pt-2">
                      <span className="font-mono text-[9px] text-muted truncate max-w-[80px]">
                        {item.sharedCirclesCount && item.sharedCirclesCount > 0
                          ? `In ${item.sharedCirclesCount} ${
                              item.sharedCirclesCount === 1 ? "Circle" : "Circles"
                            }`
                          : "Private"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenShare(item)}
                        className="flex items-center gap-1 rounded-lg border border-border-neutral bg-buttercream px-2 py-1 text-[10px] font-bold text-french-navy transition hover:border-french-navy hover:bg-french-navy hover:text-white shadow-2xs active:scale-95"
                        title={`Share "${item.title}" to circles`}
                      >
                        <Share2 size={10} strokeWidth={2.5} />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Persistent Bottom Nav */}
      <BottomNav />

      {/* Add Item Modal */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleItemAdded}
      />

      {/* Share Item to Circles Modal */}
      <ShareItemModal
        item={selectedItemToShare}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onSuccess={handleShareSuccess}
      />
    </div>
  );
}
