"use client";

import React from "react";
import { Shirt, Sparkles, Users } from "lucide-react";

export default function BottomNav() {
  const activeTab = "closet"; 

  const navItems = [
    { id: "closet", label: "Closet", icon: Shirt },
    { id: "outfits", label: "Outfits", icon: Sparkles },
    { id: "friends", label: "Friends", icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 w-full bg-cream border-t border-beige px-6 py-3 pb-safe z-40">
      <div className="max-w-md mx-auto flex justify-between items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`flex flex-col items-center gap-1 transition-colors ${
                isActive ? "text-sage" : "text-taupe hover:text-sage-light"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold tracking-wide uppercase">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
