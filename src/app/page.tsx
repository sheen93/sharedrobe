"use client";

import { useState, useEffect } from "react";
import { Bell, User, Plus, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AddItemModal from "@/components/AddItemModal";
import { createClient } from "@/utils/supabase/client";

const CATEGORIES = ["All", "Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

interface WardrobeItem {
  id: string; title: string; category: string; tags: string[]; image_url: string;
}

export default function ClosetFeed() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const supabase = createClient();

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
    if (!error) setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleItemAdded = () => { setIsModalOpen(false); fetchItems(); };

  const filteredItems = activeCategory === "All" ? items : items.filter(i => i.category === activeCategory);

  return (
    <>
      <div className="max-w-md mx-auto min-h-screen bg-cream">
        <header className="px-5 pt-12 pb-4 flex justify-between items-center sticky top-0 bg-cream/90 backdrop-blur-md z-30">
          <div>
            <h1 className="text-2xl font-bold text-charcoal tracking-tight">My Closet</h1>
            <p className="text-sm text-taupe font-medium">Hello, Hridia! 👋</p>
          </div>
          <div className="flex items-center gap-3 text-charcoal">
            <button className="p-2 bg-beige rounded-full hover:bg-sage-light/30 transition"><Bell size={20} /></button>
            <button className="p-2 bg-beige rounded-full hover:bg-sage-light/30 transition"><User size={20} /></button>
          </div>
        </header>

        <div className="px-5 py-3 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2 min-w-max">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${activeCategory === cat ? "bg-sage text-white shadow-md" : "bg-beige text-taupe"}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-2">
          <button onClick={() => setIsModalOpen(true)} className="w-full py-3.5 border-2 border-sage text-sage font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-sage hover:text-white transition-all shadow-sm">
            <Plus size={20} /> Add New Item
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="py-12 flex justify-center text-sage"><Loader2 className="animate-spin" size={32} /></div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-beige rounded-2xl overflow-hidden flex flex-col shadow-sm border border-beige hover:shadow-md transition-shadow">
                  <div className="aspect-[4/5] bg-cream w-full relative">
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-bold text-charcoal truncate">{item.title}</h3>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.tags?.map(tag => <span key={tag} className="text-[10px] px-2 py-0.5 bg-cream text-taupe rounded-md font-medium border border-sage-light/30">#{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-2 py-12 flex flex-col items-center text-taupe text-center">
                  <div className="w-16 h-16 bg-beige rounded-full flex items-center justify-center mb-3"><Plus size={24} className="text-sage" /></div>
                  <p className="font-medium text-charcoal">Your closet is empty</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
      <AddItemModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleItemAdded} />
    </>
  );
}
