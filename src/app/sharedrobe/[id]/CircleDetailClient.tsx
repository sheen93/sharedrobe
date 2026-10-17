"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  UserPlus,
  Shield,
  Sparkles,
  Check,
  X,
  Clock,
  ChevronDown,
  UserMinus,
  Loader2,
  AlertCircle,
  ExternalLink,
  Shirt,
  Filter,
  Megaphone,
  Siren,
  Activity,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AddFriendsToCircleModal from "@/components/AddFriendsToCircleModal";
import BorrowRequestModal, {
  type BorrowModalItem,
} from "@/components/BorrowRequestModal";
import {
  approveBorrowRequest,
  rejectBorrowRequest,
  removeCircleMember,
} from "@/app/sharedrobe/actions";
import type { CircleActivityType } from "@/app/sharedrobe/constants";
import { cn } from "@/utils/cn";

export interface CircleMemberProfile {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: "admin" | "member";
}

export interface CircleGarmentItem {
  id: string;
  title: string;
  category: string;
  image_url: string;
  tags: string[];
  owner_id: string;
  ownerName: string;
  ownerEmail: string;
  status: string;
  borrowed_by: string | null;
  borrowerName: string | null;
}

export interface CircleBorrowRequestItem {
  id: string;
  item_id: string;
  itemTitle: string;
  itemImageUrl: string;
  itemOwnerId: string;
  requester_id: string;
  requesterName: string;
  circle_id: string;
  status: string;
  duration_intent: string;
  created_at: string;
}

export interface CircleActivityItem {
  id: string;
  circle_id: string;
  actor_id: string;
  actorName: string;
  action_type: CircleActivityType;
  target_item_id: string | null;
  targetItemTitle: string | null;
  targetItemImageUrl: string | null;
  message: string | null;
  created_at: string;
}

interface CircleDetailClientProps {
  circle: {
    id: string;
    name: string;
    description: string | null;
    createdBy: string;
  };
  currentUserId: string;
  currentUserRole: "admin" | "member";
  members: CircleMemberProfile[];
  items: CircleGarmentItem[];
  pendingBorrowRequests: CircleBorrowRequestItem[];
  activities: CircleActivityItem[];
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CircleDetailClient({
  circle,
  currentUserId,
  currentUserRole,
  members,
  items,
  pendingBorrowRequests,
  activities,
}: CircleDetailClientProps) {
  const router = useRouter();

  // Circle View Tab state ('closet' | 'activity')
  const [activeViewTab, setActiveViewTab] = useState<"closet" | "activity">(
    "closet"
  );

  // Member Drawer filter state (null = All Closets, string = specific member's userId)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  // Admin dropdown state on member avatars (tracks userId of open dropdown)
  const [openAdminMenuUserId, setOpenAdminMenuUserId] = useState<string | null>(
    null
  );

  // Modals state
  const [borrowModalItem, setBorrowModalItem] =
    useState<BorrowModalItem | null>(null);
  const [isAddFriendsOpen, setIsAddFriendsOpen] = useState(false);

  // Optimistic tracking for newly submitted borrow requests in this session
  const [localRequestedItemIds, setLocalRequestedItemIds] = useState<string[]>(
    []
  );

  // Feedback banner
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const showFeedback = (tone: "success" | "error", text: string) => {
    setFeedback({ tone, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Filtered garments by selected member drawer
  const filteredItems = selectedOwnerId
    ? items.filter((item) => item.owner_id === selectedOwnerId)
    : items;

  const selectedMember = selectedOwnerId
    ? members.find((m) => m.userId === selectedOwnerId) || null
    : null;

  // Requests targeting items owned by the current user
  const incomingOwnerRequests = pendingBorrowRequests.filter(
    (req) => req.itemOwnerId === currentUserId && req.status === "pending"
  );

  // Set of item IDs where the current user already has a pending borrow request
  const myPendingRequestedItemIds = new Set<string>([
    ...pendingBorrowRequests
      .filter(
        (req) => req.requester_id === currentUserId && req.status === "pending"
      )
      .map((req) => req.item_id),
    ...localRequestedItemIds,
  ]);

  // Count how many items each member has shared into this circle
  const memberItemCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.owner_id] = (acc[item.owner_id] || 0) + 1;
    return acc;
  }, {});

  // Count public_nudge drama events
  const publicNudgeCount = activities.filter(
    (act) => act.action_type === "public_nudge"
  ).length;

  const handleSelectMemberAvatar = (userId: string) => {
    setOpenAdminMenuUserId(null);
    setSelectedOwnerId((prev) => (prev === userId ? null : userId));
  };

  const handleRemoveMember = (member: CircleMemberProfile) => {
    setOpenAdminMenuUserId(null);
    setActiveActionId(member.userId);

    startTransition(async () => {
      const res = await removeCircleMember(circle.id, member.userId);
      setActiveActionId(null);

      if (res.success) {
        if (selectedOwnerId === member.userId) {
          setSelectedOwnerId(null);
        }
        showFeedback(
          "success",
          `${member.fullName} has been removed from ${circle.name}.`
        );
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleApproveBorrow = (requestId: string) => {
    setActiveActionId(requestId);
    startTransition(async () => {
      const res = await approveBorrowRequest(requestId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleRejectBorrow = (requestId: string) => {
    setActiveActionId(requestId);
    startTransition(async () => {
      const res = await rejectBorrowRequest(requestId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", "Borrow request declined.");
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleGarmentCardClick = (item: CircleGarmentItem) => {
    const isOwner = item.owner_id === currentUserId;
    const isAvailable = item.status === "Available";
    const alreadyRequested = myPendingRequestedItemIds.has(item.id);

    if (!isOwner && isAvailable && !alreadyRequested) {
      setBorrowModalItem({
        id: item.id,
        title: item.title,
        category: item.category,
        image_url: item.image_url,
        owner_id: item.owner_id,
        ownerName: item.ownerName,
        status: item.status,
      });
      return;
    }

    router.push(`/items/${item.id}?from=/sharedrobe/${circle.id}`);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      <main className="relative flex w-full max-w-md flex-1 flex-col justify-between bg-buttercream sm:rounded-[32px] sm:border sm:border-border-neutral sm:shadow-2xl">
        <div className="flex-1 p-4 pb-8 sm:p-5 sm:pb-8">
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/sharedrobe"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-neutral bg-chalk px-3 py-1.5 text-xs font-bold text-midnight-slate transition hover:border-french-navy hover:text-french-navy"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Circles</span>
            </Link>

            <div className="flex items-center gap-2">
              {currentUserRole === "admin" && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-french-navy/20 bg-french-navy/10 px-2 py-1 font-mono text-[10px] font-bold text-french-navy">
                  <Shield className="h-3 w-3" />
                  CIRCLE ADMIN
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsAddFriendsOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-french-navy px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ Invite</span>
              </button>
            </div>
          </div>

          {/* Circle Title Header */}
          <div className="mt-4 rounded-2xl border border-border-neutral bg-chalk p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
                  CIRCLE CLOSET // SHAREDROBE
                </span>
                <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-midnight-slate">
                  {circle.name}
                </h1>
                <p className="mt-1 text-xs text-muted">
                  {circle.description ||
                    "Tap a bestie's avatar below to raid their closet or check the Drama Feed!"}
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-border-strong bg-buttercream px-2.5 py-1.5 text-center">
                <p className="font-mono text-xs font-extrabold text-french-navy">
                  {items.length}
                </p>
                <p className="font-mono text-[9px] uppercase text-muted">
                  Looks
                </p>
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-xl border p-3 text-xs font-medium animate-in fade-in duration-150",
                feedback.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              )}
            >
              {feedback.tone === "success" ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Segmented View Switcher: 'Closet Grid' | 'Activity (Drama Feed)' */}
          <div className="mt-3.5 flex rounded-xl border border-border-neutral bg-chalk p-1">
            <button
              type="button"
              onClick={() => setActiveViewTab("closet")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold tracking-tight transition",
                activeViewTab === "closet"
                  ? "bg-french-navy text-white shadow-xs"
                  : "text-muted hover:text-french-navy"
              )}
            >
              <Shirt className="h-3.5 w-3.5" />
              <span>Closet Racks</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 font-mono text-[9px]",
                  activeViewTab === "closet"
                    ? "bg-white/20 text-white"
                    : "bg-buttercream text-french-navy"
                )}
              >
                {items.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab("activity")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold tracking-tight transition",
                activeViewTab === "activity"
                  ? "bg-french-navy text-white shadow-xs"
                  : "text-muted hover:text-french-navy"
              )}
            >
              {publicNudgeCount > 0 ? (
                <Megaphone
                  className={cn(
                    "h-3.5 w-3.5",
                    activeViewTab === "activity"
                      ? "text-dusty-lilac"
                      : "text-dusty-lilac animate-pulse"
                  )}
                />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              <span>Activity &amp; Drama</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 font-mono text-[9px] font-bold",
                  publicNudgeCount > 0
                    ? "bg-dusty-lilac text-white"
                    : activeViewTab === "activity"
                    ? "bg-white/20 text-white"
                    : "bg-buttercream text-french-navy"
                )}
              >
                {activities.length}
              </span>
            </button>
          </div>

          {/* VIEW 1: CLOSET RACKS & MEMBER DRAWERS */}
          {activeViewTab === "closet" && (
            <>
              {/* Mini Drama Alert Teaser if there's an active public_nudge */}
              {publicNudgeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveViewTab("activity")}
                  className="mt-3.5 flex w-full items-center justify-between gap-2 rounded-2xl border border-dusty-lilac bg-dusty-lilac/15 px-3.5 py-2.5 text-left transition hover:bg-dusty-lilac/25"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-dusty-lilac text-white">
                      <Siren className="h-3.5 w-3.5" />
                    </span>
                    <p className="truncate text-xs font-bold text-french-navy">
                      🚨 {publicNudgeCount} Public Call-out
                      {publicNudgeCount > 1 ? "s" : ""} in the Drama Feed!
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-dusty-lilac underline">
                    Spill Tea →
                  </span>
                </button>
              )}

              {/* MEMBER DRAWERS: Horizontal Scroll of Member Avatars */}
              <section aria-label="Circle Member Drawers" className="mt-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-dusty-lilac" />
                    <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                      MEMBER CLOSET DRAWERS ({members.length})
                    </h2>
                  </div>
                  {selectedOwnerId && (
                    <button
                      type="button"
                      onClick={() => setSelectedOwnerId(null)}
                      className="font-mono text-[10px] font-bold text-french-navy underline hover:text-dusty-lilac"
                    >
                      Show All ({items.length})
                    </button>
                  )}
                </div>

                <div className="mt-2.5 flex items-start gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
                  {/* "All Closets" Pill */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOwnerId(null);
                      setOpenAdminMenuUserId(null);
                    }}
                    className={cn(
                      "flex min-w-[78px] shrink-0 flex-col items-center rounded-2xl border p-2.5 text-center transition",
                      selectedOwnerId === null
                        ? "border-french-navy bg-french-navy text-white shadow-md"
                        : "border-border-neutral bg-chalk text-midnight-slate hover:border-dusty-lilac"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full border text-xs font-extrabold",
                        selectedOwnerId === null
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-border-strong bg-buttercream text-french-navy"
                      )}
                    >
                      ALL
                    </div>
                    <span className="mt-1.5 w-full truncate text-[11px] font-bold">
                      All Closets
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[9px]",
                        selectedOwnerId === null ? "text-white/80" : "text-muted"
                      )}
                    >
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </button>

                  {/* Individual Member Avatars */}
                  {members.map((member) => {
                    const isSelected = selectedOwnerId === member.userId;
                    const isMe = member.userId === currentUserId;
                    const canAdminManage =
                      currentUserRole === "admin" && !isMe;
                    const isAdminMenuOpen =
                      openAdminMenuUserId === member.userId;
                    const count = memberItemCounts[member.userId] || 0;
                    const initials =
                      member.fullName
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "DR";

                    return (
                      <div
                        key={member.userId}
                        className="relative flex shrink-0 flex-col items-center"
                      >
                        <div
                          className={cn(
                            "flex min-w-[88px] flex-col items-center rounded-2xl border p-2.5 text-center transition",
                            isSelected
                              ? "border-french-navy bg-french-navy text-white shadow-md"
                              : "border-border-neutral bg-chalk text-midnight-slate hover:border-dusty-lilac"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectMemberAvatar(member.userId)
                            }
                            className="flex flex-col items-center focus:outline-none"
                            title={`Filter by ${member.fullName}'s garments`}
                          >
                            <div className="relative">
                              <div
                                className={cn(
                                  "flex h-11 w-11 items-center justify-center rounded-full border text-xs font-extrabold uppercase transition",
                                  isSelected
                                    ? "border-white/30 bg-dusty-lilac text-white"
                                    : isMe
                                    ? "border-french-navy/30 bg-french-navy/10 text-french-navy"
                                    : "border-border-strong bg-buttercream text-midnight-slate"
                                )}
                              >
                                {initials}
                              </div>
                              {member.role === "admin" && (
                                <span
                                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-dusty-lilac text-white shadow-2xs"
                                  title="Circle Admin"
                                >
                                  <Shield className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </div>

                            <span className="mt-1.5 max-w-[76px] truncate text-[11px] font-bold">
                              {isMe ? "You" : member.fullName.split(" ")[0]}
                            </span>
                            <span
                              className={cn(
                                "font-mono text-[9px]",
                                isSelected ? "text-white/80" : "text-muted"
                              )}
                            >
                              {count} {count === 1 ? "item" : "items"}
                            </span>
                          </button>

                          {/* Admin Dropdown Trigger on Member Avatar */}
                          {canAdminManage && (
                            <div className="mt-1.5 w-full pt-1 border-t border-border-neutral/40">
                              <button
                                type="button"
                                disabled={
                                  isPending && activeActionId === member.userId
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenAdminMenuUserId(
                                    isAdminMenuOpen ? null : member.userId
                                  );
                                }}
                                className={cn(
                                  "inline-flex w-full items-center justify-center gap-0.5 rounded-lg px-1.5 py-0.5 font-mono text-[9px] font-bold transition",
                                  isSelected
                                    ? "bg-white/15 text-white hover:bg-white/25"
                                    : "bg-buttercream text-french-navy hover:bg-french-navy hover:text-white"
                                )}
                                aria-expanded={isAdminMenuOpen}
                                aria-haspopup="menu"
                              >
                                {isPending &&
                                activeActionId === member.userId ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                ) : (
                                  <>
                                    <span>Admin</span>
                                    <ChevronDown className="h-2.5 w-2.5" />
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Admin Dropdown Menu ('Remove Member') */}
                        {canAdminManage && isAdminMenuOpen && (
                          <div
                            role="menu"
                            className="absolute top-full z-30 mt-1 w-36 rounded-xl border border-border-strong bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleRemoveMember(member)}
                              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-rose-600 transition hover:bg-rose-50"
                            >
                              <UserMinus className="h-3.5 w-3.5 shrink-0" />
                              <span>Remove Member</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* INCOMING BORROW REQUESTS FOR CURRENT USER'S ITEMS */}
              {incomingOwnerRequests.length > 0 && (
                <section
                  aria-label="Incoming Borrow Requests"
                  className="mt-4 rounded-2xl border border-dusty-lilac/40 bg-dusty-lilac/10 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-french-navy text-[10px] font-bold text-white">
                        {incomingOwnerRequests.length}
                      </span>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-french-navy">
                        Friends Calling Dibs on Your Closet! ✨
                      </h3>
                    </div>
                  </div>

                  <div className="mt-2.5 space-y-2">
                    {incomingOwnerRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-border-neutral bg-chalk p-2.5 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-strong bg-buttercream">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={req.itemImageUrl}
                              alt={req.itemTitle}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-midnight-slate">
                              {req.requesterName} wants &ldquo;{req.itemTitle}
                              &rdquo;
                            </p>
                            <p className="truncate font-mono text-[10px] text-dusty-lilac font-semibold">
                              ⏳ &ldquo;{req.duration_intent}&rdquo;
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isPending && activeActionId === req.id}
                            onClick={() => handleApproveBorrow(req.id)}
                            className="flex h-7 items-center gap-1 rounded-lg bg-french-navy px-2.5 text-[10px] font-bold text-white shadow-2xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                          >
                            {isPending && activeActionId === req.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3 stroke-[3]" />
                            )}
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={isPending && activeActionId === req.id}
                            onClick={() => handleRejectBorrow(req.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-neutral bg-white text-muted transition hover:text-rose-600 disabled:opacity-50"
                            title="Decline request"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* GARMENT GRID SECTION */}
              <section aria-label="Circle Shared Garments" className="mt-5">
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-french-navy" />
                    <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-midnight-slate">
                      {selectedMember
                        ? `${selectedMember.fullName}'s Shared Drawer (${filteredItems.length})`
                        : `All Circle Garments (${filteredItems.length})`}
                    </h2>
                  </div>
                  <span className="font-mono text-[10px] text-dusty-lilac font-bold">
                    Tap available item to borrow ✨
                  </span>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-2xs">
                      <Shirt className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                      {selectedMember
                        ? `${selectedMember.fullName.split(" ")[0]} hasn't dropped any pieces yet!`
                        : "This circle closet is currently empty!"}
                    </h3>
                    <p className="mt-1 max-w-xs text-xs text-muted">
                      {selectedMember
                        ? "Tap another member's avatar above or view all circle garments."
                        : "Head to MyDrobe and tap 'Share' on your favorite outfits to start the rotation."}
                    </p>
                    {selectedMember ? (
                      <button
                        type="button"
                        onClick={() => setSelectedOwnerId(null)}
                        className="mt-4 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-french-navy-hover"
                      >
                        Show All Circle Looks
                      </button>
                    ) : (
                      <Link
                        href="/"
                        className="mt-4 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-french-navy-hover"
                      >
                        Share from MyDrobe →
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredItems.map((item) => {
                      const isOwner = item.owner_id === currentUserId;
                      const isAvailable = item.status === "Available";
                      const hasPendingDibs = myPendingRequestedItemIds.has(
                        item.id
                      );

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleGarmentCardClick(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleGarmentCardClick(item);
                            }
                          }}
                          className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-neutral bg-chalk shadow-xs transition hover:-translate-y-0.5 hover:border-french-navy hover:shadow-md focus:outline-none focus:ring-2 focus:ring-french-navy"
                        >
                          {/* Garment Image */}
                          <div className="relative aspect-[4/5] w-full overflow-hidden bg-buttercream">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />

                            {/* Status Badge Top-Left */}
                            <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
                              {item.status !== "Available" ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[9px] font-bold shadow-xs backdrop-blur-xs",
                                    item.status === "Lent Out"
                                      ? "bg-dusty-lilac/95 text-white"
                                      : "bg-amber-500/95 text-white"
                                  )}
                                >
                                  {item.status === "Lent Out"
                                    ? item.borrowerName
                                      ? `Lent to ${item.borrowerName.split(" ")[0]}`
                                      : "Lent Out"
                                    : "In Laundry"}
                                </span>
                              ) : hasPendingDibs ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-french-navy/90 px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-xs">
                                  <Clock className="h-2.5 w-2.5" />
                                  Dibs Pending
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/90 px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-xs">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Available
                                </span>
                              )}
                            </div>

                            {/* Direct Link to Item Detail Top-Right */}
                            <Link
                              href={`/items/${item.id}?from=/sharedrobe/${circle.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-buttercream/90 text-midnight-slate shadow-xs transition hover:bg-french-navy hover:text-white"
                              title="Inspect item page"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>

                            {/* Category Pill Bottom-Right */}
                            <span className="absolute bottom-2 right-2 rounded-md bg-french-navy/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                              {item.category}
                            </span>
                          </div>

                          {/* Card Footer */}
                          <div className="flex flex-1 flex-col justify-between p-3">
                            <div>
                              <h3 className="truncate text-xs font-extrabold text-midnight-slate group-hover:text-french-navy">
                                {item.title}
                              </h3>
                              <p className="mt-0.5 truncate text-[10px] text-muted">
                                {isOwner
                                  ? "Your Closet Piece"
                                  : `${item.ownerName.split(" ")[0]}'s Closet`}
                              </p>
                            </div>

                            {/* Action Callout Button */}
                            <div className="mt-2.5 pt-2 border-t border-border-neutral/60">
                              {isOwner ? (
                                <span className="inline-flex w-full items-center justify-center rounded-lg bg-buttercream py-1.5 font-mono text-[10px] font-bold text-muted">
                                  Manage Your Piece →
                                </span>
                              ) : hasPendingDibs ? (
                                <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-dusty-lilac/15 py-1.5 font-mono text-[10px] font-bold text-french-navy">
                                  <Clock className="h-3 w-3 text-dusty-lilac" />
                                  Dibs Requested
                                </span>
                              ) : isAvailable ? (
                                <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-french-navy py-1.5 font-mono text-[10px] font-bold text-white shadow-2xs transition group-hover:bg-french-navy-hover">
                                  <Sparkles className="h-3 w-3 text-dusty-lilac" />
                                  Borrow This Look
                                </span>
                              ) : (
                                <span className="inline-flex w-full items-center justify-center rounded-lg bg-buttercream py-1.5 font-mono text-[10px] font-semibold text-muted">
                                  Currently {item.status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {/* VIEW 2: THE DRAMA & ACTIVITY FEED */}
          {activeViewTab === "activity" && (
            <section
              aria-label="Circle Activity and Drama Feed"
              className="mt-4 space-y-3"
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <Megaphone className="h-3.5 w-3.5 text-dusty-lilac" />
                  <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-midnight-slate">
                    THE DRAMA &amp; ROTATION FEED ({activities.length})
                  </h2>
                </div>
                <span className="font-mono text-[10px] font-bold text-dusty-lilac">
                  Live Circle Tea ☕
                </span>
              </div>

              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-2xs">
                    <Megaphone className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                    Zero drama in {circle.name}... yet! 👀
                  </h3>
                  <p className="mt-1 max-w-xs text-xs text-muted">
                    When members drop new clothes, borrow outfits, or publicly
                    call someone out to return a piece, it all goes down right
                    here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("closet")}
                    className="mt-4 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-french-navy-hover"
                  >
                    Browse Circle Closet →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((act) => {
                    const isPublicNudge = act.action_type === "public_nudge";
                    const isBorrowed = act.action_type === "borrowed_item";

                    if (isPublicNudge) {
                      return (
                        <div
                          key={act.id}
                          className="relative overflow-hidden rounded-2xl border-2 border-dusty-lilac bg-dusty-lilac p-4 text-white shadow-lg"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-french-navy px-2.5 py-1 font-mono text-[9px] font-extrabold uppercase tracking-wider text-white shadow-2xs">
                              <Siren className="h-3.5 w-3.5 text-amber-300 animate-bounce" />
                              FRIENDLY DRAMA // PUBLIC CALL-OUT
                            </span>
                            <span className="font-mono text-[10px] font-bold text-white/85">
                              {formatRelativeTime(act.created_at)}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-3">
                            {act.targetItemImageUrl ? (
                              <Link
                                href={
                                  act.target_item_id
                                    ? `/items/${act.target_item_id}?from=/sharedrobe/${circle.id}`
                                    : "#"
                                }
                                className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-white/60 bg-buttercream shadow-sm transition hover:scale-105"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={act.targetItemImageUrl}
                                  alt={act.targetItemTitle || "Garment"}
                                  className="h-full w-full object-cover"
                                />
                              </Link>
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-french-navy/30 text-white">
                                <Megaphone className="h-6 w-6" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold leading-snug text-white">
                                {act.message ||
                                  `🚨 Time to return "${act.targetItemTitle || "that borrowed piece"}"!`}
                              </p>
                              <p className="mt-1 font-mono text-[10px] font-semibold text-white/90">
                                Sounded by {act.actorName}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={act.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border-neutral bg-chalk p-3.5 shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {act.targetItemImageUrl ? (
                            <Link
                              href={
                                act.target_item_id
                                  ? `/items/${act.target_item_id}?from=/sharedrobe/${circle.id}`
                                  : "#"
                              }
                              className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border-strong bg-buttercream"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={act.targetItemImageUrl}
                                alt={act.targetItemTitle || "Garment"}
                                className="h-full w-full object-cover"
                              />
                            </Link>
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-buttercream text-french-navy">
                              {isBorrowed ? (
                                <Sparkles className="h-5 w-5 text-dusty-lilac" />
                              ) : (
                                <Shirt className="h-5 w-5 text-french-navy" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.2 font-mono text-[8px] font-bold uppercase",
                                  isBorrowed
                                    ? "bg-french-navy text-white"
                                    : "bg-dusty-lilac/20 text-french-navy"
                                )}
                              >
                                {isBorrowed
                                  ? "BORROWED LOOK ✨"
                                  : "CLOSET DROP 🧥"}
                              </span>
                              <span className="font-mono text-[9px] text-muted">
                                {formatRelativeTime(act.created_at)}
                              </span>
                            </div>

                            <p className="mt-1 text-xs font-bold text-midnight-slate leading-snug">
                              {act.message ||
                                `${act.actorName} ${
                                  isBorrowed ? "borrowed" : "shared"
                                } "${act.targetItemTitle || "a garment"}"`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Integrated Docked Bottom Nav */}
        <BottomNav />
      </main>

      {/* Borrow Request Modal */}
      <BorrowRequestModal
        isOpen={Boolean(borrowModalItem)}
        onClose={() => setBorrowModalItem(null)}
        item={borrowModalItem}
        circleId={circle.id}
        circleName={circle.name}
        onSuccess={(message, itemId) => {
          setLocalRequestedItemIds((prev) => [...prev, itemId]);
          showFeedback("success", message);
          router.refresh();
        }}
      />

      {/* Invite Friends Modal */}
      <AddFriendsToCircleModal
        isOpen={isAddFriendsOpen}
        onClose={() => setIsAddFriendsOpen(false)}
        circle={{
          id: circle.id,
          name: circle.name,
          description: circle.description,
          role: currentUserRole,
          status: "approved",
          memberCount: members.length,
          sharedItemCount: items.length,
          memberUserIds: members.map((m) => m.userId),
        }}
        friends={[]}
        onSuccess={(addedCount, circleName) => {
          showFeedback(
            "success",
            addedCount > 0
              ? `Added ${addedCount} ${addedCount === 1 ? "friend" : "friends"} to ${circleName}!`
              : `Friends updated for ${circleName}.`
          );
          router.refresh();
        }}
      />
    </div>
  );
}
