"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  X,
  UserPlus,
  Users,
  Check,
  Search,
  Loader2,
  Shield,
  Clock,
} from "lucide-react";
import FormMessage from "@/components/ui/FormMessage";
import { cn } from "@/utils/cn";
import {
  addFriendsToCircle,
  getCircleFriendsStatus,
  type CircleFriendCandidate,
} from "@/app/sharedrobe/actions";
import type { UserCircleData, UserFriendData } from "@/app/sharedrobe/SharedrobeClient";

interface AddFriendsToCircleModalProps {
  circle: UserCircleData | null;
  friends: UserFriendData[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (addedCount: number, circleName: string) => void;
  onSwitchToSearch?: () => void;
}

export default function AddFriendsToCircleModal({
  circle,
  friends,
  isOpen,
  onClose,
  onSuccess,
  onSwitchToSearch,
}: AddFriendsToCircleModalProps) {
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [candidates, setCandidates] = useState<CircleFriendCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load authoritative circle friends status asynchronously
  useEffect(() => {
    if (!isOpen || !circle) return;

    let isMounted = true;
    getCircleFriendsStatus(circle.id).then((res) => {
      if (!isMounted) return;
      if (res.success && res.data) {
        setCandidates(res.data);
      } else {
        const existingMemberSet = new Set(circle.memberUserIds || []);
        setCandidates(
          friends.map((f) => ({
            id: f.id,
            fullName: f.fullName,
            email: f.email,
            isAlreadyMember: existingMemberSet.has(f.id),
            isPending: false,
          }))
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, circle, friends]);

  const handleClose = () => {
    setSelectedFriendIds([]);
    setSearchFilter("");
    setErrorMessage(null);
    onClose();
  };

  if (!isOpen || !circle) return null;

  // Filter candidates by search term
  const query = searchFilter.trim().toLowerCase();
  const filteredCandidates = candidates.filter(
    (c) =>
      c.fullName.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query)
  );

  const availableCandidates = filteredCandidates.filter(
    (c) => !c.isAlreadyMember && !c.isPending
  );

  const allAvailableSelected =
    availableCandidates.length > 0 &&
    availableCandidates.every((c) => selectedFriendIds.includes(c.id));

  const toggleSelectFriend = (friendId: string, isAlreadyInCircle: boolean) => {
    if (isAlreadyInCircle) return;
    setErrorMessage(null);
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleSelectAllToggle = () => {
    if (allAvailableSelected) {
      const availableIdSet = new Set(availableCandidates.map((c) => c.id));
      setSelectedFriendIds((prev) => prev.filter((id) => !availableIdSet.has(id)));
    } else {
      const newIds = new Set([
        ...selectedFriendIds,
        ...availableCandidates.map((c) => c.id),
      ]);
      setSelectedFriendIds(Array.from(newIds));
    }
  };

  const handleSubmit = () => {
    if (selectedFriendIds.length === 0) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await addFriendsToCircle(circle.id, selectedFriendIds);
      if (res.success) {
        onSuccess(res.data?.addedCount ?? selectedFriendIds.length, circle.name);
        onClose();
      } else {
        setErrorMessage(res.error || "Failed to add selected friends to circle.");
      }
    });
  };

  const selectedCount = selectedFriendIds.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight-slate/40 backdrop-blur-xs"
    >
      <div className="relative flex w-full max-w-[420px] max-h-[90vh] flex-col overflow-hidden rounded-[28px] border border-border-neutral bg-buttercream p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border-neutral pb-3.5">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
              <Users size={12} className="shrink-0" />
              <span>SHARE DROBE // CIRCLE ROSTER</span>
            </div>
            <h2 className="mt-1 text-base font-bold text-midnight-slate truncate">
              Add Friends to Circle
            </h2>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded bg-french-navy/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-french-navy">
                {circle.name}
              </span>
              {circle.role === "admin" && (
                <span className="inline-flex items-center gap-0.5 rounded border border-french-navy/20 bg-french-navy/5 px-1 py-0.2 font-mono text-[9px] font-bold text-french-navy">
                  <Shield size={9} /> ADMIN
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-muted transition hover:bg-border-neutral hover:text-midnight-slate active:scale-95"
            aria-label="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-3">
            <FormMessage tone="error">{errorMessage}</FormMessage>
          </div>
        )}

        {/* Friends Filter & Quick Select Bar */}
        {friends.length > 0 && (
          <div className="mt-3.5 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted h-3.5 w-3.5" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search friends by name or email..."
                className="w-full rounded-xl border border-border-neutral bg-chalk py-1.5 pl-8 pr-3 text-xs text-midnight-slate placeholder:text-muted focus:border-french-navy focus:bg-white focus:outline-hidden"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-midnight-slate"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {availableCandidates.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="font-mono text-[10px] text-muted">
                  {selectedCount} selected of {availableCandidates.length} eligible
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllToggle}
                  className="font-mono text-[10px] font-bold text-french-navy hover:text-dusty-lilac transition"
                >
                  {allAvailableSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Friends List Container */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-2 max-h-[320px] pr-1">
          {friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="mt-2.5 text-xs font-bold text-midnight-slate">
                No connected friends yet
              </h4>
              <p className="mt-1 text-[11px] text-muted max-w-[240px]">
                Connect with members in your network before inviting them into private circles.
              </p>
              {onSwitchToSearch && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToSearch();
                  }}
                  className="mt-3 flex items-center gap-1.5 rounded-xl bg-french-navy px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs hover:bg-french-navy-hover transition"
                >
                  <UserPlus size={12} /> Search Members
                </button>
              )}
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="rounded-xl border border-border-neutral bg-chalk p-4 text-center text-xs text-muted">
              No friends match &ldquo;{searchFilter}&rdquo;
            </div>
          ) : (
            filteredCandidates.map((friend) => {
              const isAlreadyInCircle = friend.isAlreadyMember;
              const isPendingApproval = friend.isPending;
              const isSelected = selectedFriendIds.includes(friend.id);

              return (
                <div
                  key={friend.id}
                  onClick={() =>
                    toggleSelectFriend(friend.id, isAlreadyInCircle || isPendingApproval)
                  }
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-2.5 transition text-left select-none",
                    isAlreadyInCircle || isPendingApproval
                      ? "border-border-neutral/60 bg-chalk/40 opacity-70 cursor-not-allowed"
                      : isSelected
                      ? "border-french-navy bg-white shadow-xs cursor-pointer ring-1 ring-french-navy"
                      : "border-border-neutral bg-chalk hover:border-dusty-lilac hover:bg-white cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white uppercase transition",
                        isAlreadyInCircle
                          ? "bg-muted"
                          : isSelected
                          ? "bg-french-navy"
                          : "bg-dusty-lilac"
                      )}
                    >
                      {friend.fullName.slice(0, 2) || "FR"}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="truncate text-xs font-bold text-midnight-slate">
                          {friend.fullName}
                        </p>
                      </div>
                      <p className="truncate text-[10px] text-muted">
                        {friend.email}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center">
                    {isAlreadyInCircle ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-800">
                        <Check size={10} strokeWidth={3} /> MEMBER
                      </span>
                    ) : isPendingApproval ? (
                      <span className="inline-flex items-center gap-1 rounded bg-border-neutral/60 px-2 py-0.5 font-mono text-[9px] font-medium text-muted">
                        <Clock size={10} /> PENDING
                      </span>
                    ) : (
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border transition",
                          isSelected
                            ? "border-french-navy bg-french-navy text-white"
                            : "border-border-strong bg-white text-transparent"
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex items-center gap-2 border-t border-border-neutral pt-3.5">
          <button
            type="button"
            disabled={isPending}
            onClick={handleClose}
            className="flex-1 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold uppercase tracking-wider text-muted transition hover:bg-border-neutral hover:text-midnight-slate active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || selectedCount === 0}
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-french-navy py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Adding...</span>
              </>
            ) : (
              <>
                <UserPlus size={13} />
                <span>Add {selectedCount > 0 ? `(${selectedCount}) ` : ""}Friends</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
