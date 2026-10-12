"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Plus, Loader2, Database, Shirt, Tag } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AddItemModal from "@/components/AddItemModal";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";
import { createClient } from "@/utils/supabase/client";

const CATEGORIES = ["All", "Top", "Bottom", "Dress", "Accessories", "Fav Outfit"] as const;

interface WardrobeItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  image_url: string;
  owner_id?: string;
  created_at?: string;
}

export default function MyDrobePage() {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const supabase = createClient();

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let query = supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });

      if (user?.id) {
        query = query.eq("owner_id", user.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch wardrobe items:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let query = supabase
          .from("items")
          .select("*")
          .order("created_at", { ascending: false });

        if (user?.id) {
          query = query.eq("owner_id", user.id);
        }

        const { data, error } = await query;
        if (active && !error && data) {
          setItems(data);
        }
      } catch (err) {
        if (active) {
          console.error("Failed to load wardrobe items:", err);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const handleItemAdded = () => {
    setIsModalOpen(false);
    fetchItems();
  };

  const filteredItems =
    activeCategory === "All"
      ? items
      : items.filter((i) => i.category.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen p-4 pb-24 sm:p-6">
      {/* Dev / Screen indicator matching Stitch reference */}
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span className="rounded bg-french-navy px-2 py-0.5 text-[10px] text-white">
          SCREEN 1
        </span>
        <span>Personal Closet Database</span>
      </div>

      {/* Mobile Shell */}
      <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] border border-border-neutral bg-buttercream p-5 shadow-2xl">
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
          detail={`${items.length} Items Total`}
          className="mt-3"
        />

        {/* Category Pills (horizontal scroll) */}
        <div className="hide-scrollbar -mx-1 mt-3.5 flex gap-1.5 overflow-x-auto px-1 py-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold tracking-tight transition ${
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
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-dusty-lilac" />
              <span className="mt-2 text-xs font-semibold uppercase tracking-wider">
                Loading Closet...
              </span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                <Shirt className="h-6 w-6 stroke-[2]" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                No items in this category
              </h3>
              <p className="mt-1 text-xs text-muted">
                Tap the + button above to upload garments to your personal database.
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
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border-neutral bg-chalk shadow-sm transition hover:shadow-md"
                >
                  <div className="relative aspect-[4/5] w-full bg-buttercream overflow-hidden">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Persistent Bottom Nav with MyDrobe active */}
      <BottomNav />

      {/* Add Item Modal */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleItemAdded}
      />
    </div>
  );
}
