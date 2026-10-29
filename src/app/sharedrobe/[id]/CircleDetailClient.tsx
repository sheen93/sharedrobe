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
  UserMinus,
  Loader2,
  AlertCircle,
  ExternalLink,
  Shirt,
  Filter,
  Megaphone,
  Siren,
  Activity,
  ThumbsUp,
  ThumbsDown,
  Layers,
  LogOut,
  Settings2,
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
  leaveCircle,
  resolveBorrowDrama,
  cancelBorrowRequest,
  createSosRequest,
  suggestItemForSos,
  acceptSosSuggestion,
} from "@/app/sharedrobe/actions";
import { castOutfitVote } from "@/app/outfits/actions";
import type { OutfitVoteType } from "@/app/outfits/constants";
import type { CircleActivityType } from "@/app/sharedrobe/constants";
import { cn } from "@/utils/cn";

export interface SosSuggestionItem {
  id: string;
  sos_id: string;
  suggester_id: string;
  suggesterName: string;
  item_id: string;
  itemTitle: string;
  itemImageUrl: string;
  itemCategory: string;
  itemStatus: string;
  itemOwnerId: string;
  status: "suggested" | "accepted" | "declined";
  created_at: string;
}

export interface SosRequestItem {
  id: string;
  requester_id: string;
  requesterName: string;
  circle_id: string;
  event_description: string;
  target_date: string;
  status: "active" | "fulfilled" | "cancelled";
  created_at: string;
  suggestions: SosSuggestionItem[];
}

export interface MyAvailableGarment {
  id: string;
  title: string;
  category: string;
  image_url: string;
  status: string;
}

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

export interface CircleLookbookSummary {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  yayCount: number;
  nayCount: number;
  myVote: OutfitVoteType | null;
  items: {
    id: string;
    title: string;
    image_url: string;
    owner_id: string;
  }[];
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
  target_outfit_id?: string | null;
  targetOutfit?: CircleLookbookSummary | null;
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
  sosRequests?: SosRequestItem[];
  myAvailableItems?: MyAvailableGarment[];
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
  sosRequests = [],
  myAvailableItems = [],
}: CircleDetailClientProps) {
  const router = useRouter();

  // SOS state
  const [isSosModalOpen, setIsSosModalOpen] = useState(false);
  const [sosEventDescription, setSosEventDescription] = useState("");
  const [sosTargetDate, setSosTargetDate] = useState("");
  const [isSubmittingSos, setIsSubmittingSos] = useState(false);

  // Suggest Item State
  const [selectedSosForSuggest, setSelectedSosForSuggest] =
    useState<SosRequestItem | null>(null);
  const [isSuggestingItemId, setIsSuggestingItemId] = useState<string | null>(
    null
  );
  const [isAcceptingSuggestion, setIsAcceptingSuggestion] = useState<
    string | null
  >(null);

  // Circle View Tab state ('closet' | 'activity')
  const [activeViewTab, setActiveViewTab] = useState<"closet" | "activity">(
    "closet"
  );

  // Member Drawer filter state (null = All Closets, string = specific member's userId)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  // Modals state
  const [borrowModalItem, setBorrowModalItem] =
    useState<BorrowModalItem | null>(null);
  const [isAddFriendsOpen, setIsAddFriendsOpen] = useState(false);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);

  // Optimistic tracking for newly submitted borrow requests in this session
  const [localRequestedItemIds, setLocalRequestedItemIds] = useState<string[]>(
    []
  );

  // Track seen public_nudge drama signature so the alert banner disappears after checking once
  const publicNudgeActivities = activities.filter(
    (act) => act.action_type === "public_nudge"
  );
  const publicNudgeCount = publicNudgeActivities.length;
  const publicNudgeSignature = publicNudgeActivities
    .map((act) => act.id)
    .sort()
    .join(",");
  const dramaStorageKey = `sharedrobe_seen_drama_${circle.id}`;

  const [seenDramaSignature, setSeenDramaSignature] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        return window.localStorage.getItem(dramaStorageKey);
      } catch {
        return null;
      }
    }
  );

  const markDramaFeedSeen = () => {
    if (!publicNudgeSignature) return;
    setSeenDramaSignature(publicNudgeSignature);
    try {
      window.localStorage.setItem(dramaStorageKey, publicNudgeSignature);
    } catch {
      // Ignore storage errors
    }
  };

  // Track last visited timestamp for the Activity & Drama feed so the count reflects only new notifications
  const activityStorageKey = `sharedrobe_last_seen_activity_${circle.id}`;

  const [lastSeenActivityTime, setLastSeenActivityTime] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now();
    try {
      const stored = window.localStorage.getItem(activityStorageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      // On initial visit to this circle, initialize to now so historical activities aren't counted as new
      const now = Date.now();
      window.localStorage.setItem(activityStorageKey, String(now));
      return now;
    } catch {
      return Date.now();
    }
  });

  const markActivityFeedSeen = () => {
    const now = Date.now();
    setLastSeenActivityTime(now);
    try {
      window.localStorage.setItem(activityStorageKey, String(now));
    } catch {
      // Ignore storage errors
    }
  };

  const handleSwitchViewTab = (tab: "closet" | "activity") => {
    if (tab === "activity") {
      markDramaFeedSeen();
      markActivityFeedSeen();
    }
    setActiveViewTab(tab);
  };

  const hasUnseenPublicNudge =
    publicNudgeCount > 0 && seenDramaSignature !== publicNudgeSignature;

  // Count unread activities created after the user's last visit to the activity feed
  const unreadActivityCount =
    activeViewTab === "activity"
      ? 0
      : activities.filter((act) => {
          const actTime = new Date(act.created_at).getTime();
          return !isNaN(actTime) && actTime > lastSeenActivityTime;
        }).length;

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

  const handleCreateSos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sosEventDescription.trim().length < 3) {
      showFeedback(
        "error",
        "Please provide a valid event description (at least 3 characters)."
      );
      return;
    }
    if (!sosTargetDate) {
      showFeedback("error", "Please pick an event date.");
      return;
    }
    setIsSubmittingSos(true);
    try {
      const res = await createSosRequest(
        circle.id,
        sosEventDescription,
        sosTargetDate
      );
      if (res.success) {
        setIsSosModalOpen(false);
        setSosEventDescription("");
        setSosTargetDate("");
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    } catch {
      showFeedback("error", "Failed to submit SOS request.");
    } finally {
      setIsSubmittingSos(false);
    }
  };

  const handleSuggestItem = async (itemId: string, itemTitle?: string) => {
    if (!selectedSosForSuggest) return;
    setIsSuggestingItemId(itemId);
    try {
      const res = await suggestItemForSos(selectedSosForSuggest.id, itemId);
      if (res.success) {
        setSelectedSosForSuggest(null);
        showFeedback(
          "success",
          res.message || (itemTitle ? `Suggested "${itemTitle}"!` : "Garment suggested!")
        );
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    } catch {
      showFeedback("error", "Failed to suggest garment.");
    } finally {
      setIsSuggestingItemId(null);
    }
  };

  const handleAcceptSuggestion = async (
    suggestionId: string,
    itemTitle?: string
  ) => {
    setIsAcceptingSuggestion(suggestionId);
    try {
      const res = await acceptSosSuggestion(
        suggestionId,
        "Just for the weekend"
      );
      if (res.success) {
        showFeedback(
          "success",
          res.message || (itemTitle ? `Accepted "${itemTitle}"!` : "Suggestion accepted!")
        );
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    } catch {
      showFeedback("error", "Failed to accept garment suggestion.");
    } finally {
      setIsAcceptingSuggestion(null);
    }
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

  const handleSelectMemberAvatar = (userId: string) => {
    setSelectedOwnerId((prev) => (prev === userId ? null : userId));
  };

  const handleRemoveMember = (member: CircleMemberProfile) => {
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

  const handleLeaveCircle = () => {
    setActiveActionId("leave-circle");
    startTransition(async () => {
      const res = await leaveCircle(circle.id);
      setActiveActionId(null);
      if (res.success) {
        setIsManageMembersOpen(false);
        router.push("/sharedrobe");
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleResolveDrama = (params: {
    itemId?: string | null;
    activityId?: string | null;
    actionKey: string;
  }) => {
    setActiveActionId(params.actionKey);
    startTransition(async () => {
      const res = await resolveBorrowDrama({
        itemId: params.itemId,
        activityId: params.activityId,
        circleId: circle.id,
      });
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", res.message);
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

  const handleCancelBorrow = (itemId: string) => {
    const actionKey = `cancel-borrow-${itemId}`;
    setActiveActionId(actionKey);
    startTransition(async () => {
      const res = await cancelBorrowRequest({
        itemId,
        circleId: circle.id,
      });
      setActiveActionId(null);
      if (res.success) {
        setLocalRequestedItemIds((prev) =>
          prev.filter((id) => id !== itemId)
        );
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleGarmentCardClick = (item: CircleGarmentItem) => {
    router.push(`/items/${item.id}?from=/sharedrobe/${circle.id}`);
  };

  const handleVoteOnLookbook = (outfitId: string, vote: OutfitVoteType) => {
    setActiveActionId(`${outfitId}-${vote}`);
    startTransition(async () => {
      const res = await castOutfitVote(outfitId, vote);
      setActiveActionId(null);
      if (res.success) {
        showFeedback(
          "success",
          res.message ?? `Voted ${vote === "yay" ? "👍 Yay" : "👎 Nay"}!`
        );
        router.refresh();
      } else {
        showFeedback("error", res.error ?? "Could not record vote.");
      }
    });
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

            <div className="mt-3.5 border-t border-border-neutral/80 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsSosModalOpen(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 text-[11px] sm:text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-100 active:scale-95"
                >
                  <Siren className="h-3.5 w-3.5 shrink-0 text-rose-600 animate-pulse" />
                  <span className="truncate">Ask the Group (SOS)</span>
                </button>

                <Link
                  href={`/outfits/builder?circleId=${circle.id}&from=/sharedrobe/${circle.id}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-dusty-lilac px-2.5 text-[11px] sm:text-xs font-bold text-white shadow-2xs transition hover:opacity-95 active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">+ Build Lookbook</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Mini SOS Alert Teaser if there are active SOS requests */}
          {sosRequests.length > 0 && (
            <button
              type="button"
              onClick={() => handleSwitchViewTab("activity")}
              className="mt-3 flex w-full items-center justify-between gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-left transition hover:bg-rose-100/70"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-2xs">
                  <Siren className="h-4 w-4 animate-pulse" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-french-navy truncate">
                    🚨 {sosRequests.length} Active {sosRequests.length === 1 ? "Outfit SOS" : "Outfit SOS Events"}!
                  </p>
                  <p className="text-[10px] text-muted truncate">
                    &ldquo;{sosRequests[0].event_description}&rdquo; — tap to help!
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-xl bg-rose-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-2xs">
                Urgent Requests →
              </span>
            </button>
          )}

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
              onClick={() => handleSwitchViewTab("closet")}
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
              onClick={() => handleSwitchViewTab("activity")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold tracking-tight transition",
                activeViewTab === "activity"
                  ? "bg-french-navy text-white shadow-xs"
                  : "text-muted hover:text-french-navy"
              )}
            >
              {hasUnseenPublicNudge ? (
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
              {unreadActivityCount > 0 && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.2 font-mono text-[9px] font-bold animate-in fade-in zoom-in-95 duration-150",
                    hasUnseenPublicNudge
                      ? "bg-rose-500 text-white shadow-2xs animate-pulse"
                      : activeViewTab === "activity"
                      ? "bg-white/20 text-white"
                      : "bg-dusty-lilac text-white shadow-2xs"
                  )}
                  title={`${unreadActivityCount} new notification${unreadActivityCount > 1 ? "s" : ""} since last visit`}
                >
                  {unreadActivityCount > 99 ? "99+" : unreadActivityCount}
                </span>
              )}
            </button>
          </div>

          {/* VIEW 1: CLOSET RACKS & MEMBER DRAWERS */}
          {activeViewTab === "closet" && (
            <>
              {/* Mini Drama Alert Teaser if there's an UNSEEN public_nudge */}
              {hasUnseenPublicNudge && (
                <button
                  type="button"
                  onClick={() => handleSwitchViewTab("activity")}
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

              {/* MEMBER DRAWERS: Uniform Horizontal Scroll of Member Avatars */}
              <section aria-label="Circle Member Drawers" className="mt-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-dusty-lilac" />
                    <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                      MEMBER CLOSET DRAWERS ({members.length})
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedOwnerId && (
                      <button
                        type="button"
                        onClick={() => setSelectedOwnerId(null)}
                        className="font-mono text-[10px] font-bold text-french-navy underline hover:text-dusty-lilac"
                      >
                        Show All ({items.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsManageMembersOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border-neutral bg-chalk px-2 py-1 font-mono text-[10px] font-bold text-midnight-slate transition hover:border-french-navy hover:text-french-navy"
                    >
                      <Settings2 className="h-3 w-3 text-dusty-lilac" />
                      <span>
                        {currentUserRole === "admin"
                          ? "Manage Members"
                          : "Members"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex items-stretch gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
                  {/* "All Closets" Uniform Card */}
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerId(null)}
                    className={cn(
                      "flex h-[108px] w-[88px] shrink-0 flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition",
                      selectedOwnerId === null
                        ? "border-french-navy bg-french-navy text-white shadow-md"
                        : "border-border-neutral bg-chalk text-midnight-slate hover:border-dusty-lilac"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold",
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

                  {/* Individual Member Uniform Cards */}
                  {members.map((member) => {
                    const isSelected = selectedOwnerId === member.userId;
                    const isMe = member.userId === currentUserId;
                    const count = memberItemCounts[member.userId] || 0;
                    const initials =
                      member.fullName
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "DR";

                    return (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() => handleSelectMemberAvatar(member.userId)}
                        title={`Filter by ${member.fullName}'s garments`}
                        className={cn(
                          "flex h-[108px] w-[88px] shrink-0 flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition focus:outline-none",
                          isSelected
                            ? "border-french-navy bg-french-navy text-white shadow-md"
                            : "border-border-neutral bg-chalk text-midnight-slate hover:border-dusty-lilac"
                        )}
                      >
                        <div className="relative">
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold uppercase transition",
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

                        <span className="mt-1.5 w-full truncate text-[11px] font-bold">
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
                    Tap item to open ✨
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
                              {item.status === "Lent Out" &&
                              (isOwner ||
                                item.borrowed_by === currentUserId) ? (
                                <button
                                  type="button"
                                  disabled={
                                    isPending &&
                                    activeActionId === `resolve-item-${item.id}`
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResolveDrama({
                                      itemId: item.id,
                                      actionKey: `resolve-item-${item.id}`,
                                    });
                                  }}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 font-mono text-[10px] font-bold text-white shadow-2xs transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                                >
                                  {isPending &&
                                  activeActionId ===
                                    `resolve-item-${item.id}` ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3 stroke-[3]" />
                                  )}
                                  <span>Mark Returned ✨</span>
                                </button>
                              ) : isOwner ? (
                                <span className="inline-flex w-full items-center justify-center rounded-lg bg-buttercream py-1.5 font-mono text-[10px] font-bold text-muted">
                                  Manage Your Piece →
                                </span>
                              ) : hasPendingDibs ? (
                                <button
                                  type="button"
                                  disabled={
                                    isPending &&
                                    activeActionId ===
                                      `cancel-borrow-${item.id}`
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelBorrow(item.id);
                                  }}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 py-1.5 font-mono text-[10px] font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                                >
                                  {isPending &&
                                  activeActionId ===
                                    `cancel-borrow-${item.id}` ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  <span>Cancel Request</span>
                                </button>
                              ) : isAvailable ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBorrowModalItem({
                                      id: item.id,
                                      title: item.title,
                                      category: item.category,
                                      image_url: item.image_url,
                                      owner_id: item.owner_id,
                                      ownerName: item.ownerName,
                                      status: item.status,
                                    });
                                  }}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-french-navy py-1.5 font-mono text-[10px] font-bold text-white shadow-2xs transition hover:bg-french-navy-hover active:scale-95"
                                >
                                  <Sparkles className="h-3 w-3 text-dusty-lilac" />
                                  <span>Borrow This Item</span>
                                </button>
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
              className="mt-4 space-y-4"
            >
              {/* URGENT SOS REQUESTS SECTION */}
              {sosRequests.length > 0 && (
                <div className="space-y-2.5 pb-2 border-b border-border-neutral">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5">
                      <Siren className="h-4 w-4 text-rose-600 animate-pulse" />
                      <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        URGENT REQUESTS ({sosRequests.length})
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSosModalOpen(true)}
                      className="font-mono text-[10px] font-bold text-rose-600 hover:text-rose-800 underline"
                    >
                      + Ask SOS
                    </button>
                  </div>

                  <div className="space-y-3">
                    {sosRequests.map((sos) => {
                      const isMySos = sos.requester_id === currentUserId;
                      const hasAccepted = sos.suggestions.some(
                        (s) => s.status === "accepted"
                      );

                      return (
                        <div
                          key={sos.id}
                          className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-2xs"
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 font-mono text-xs font-bold text-rose-700">
                                {sos.requesterName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-french-navy">
                                    {isMySos ? "You" : sos.requesterName}
                                  </span>
                                  <span className="rounded-md bg-rose-100 px-1.5 py-0.2 font-mono text-[9px] font-extrabold uppercase text-rose-700">
                                    SOS Event
                                  </span>
                                </div>
                                <p className="font-mono text-[10px] text-muted">
                                  {formatRelativeTime(sos.created_at)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 rounded-xl border border-rose-200 bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-rose-700 shadow-2xs">
                              <Clock size={11} className="text-rose-500" />
                              <span>Needed: {sos.target_date}</span>
                            </div>
                          </div>

                          {/* Event Description */}
                          <div className="rounded-xl border border-rose-100 bg-white/80 p-3">
                            <p className="text-xs font-semibold text-midnight-slate leading-relaxed">
                              &ldquo;{sos.event_description}&rdquo;
                            </p>
                          </div>

                          {/* Suggestions Received */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                                Suggestions ({sos.suggestions.length})
                              </span>
                              {isMySos &&
                                sos.suggestions.length > 0 &&
                                !hasAccepted && (
                                  <span className="text-[10px] font-semibold text-dusty-lilac">
                                    Accept &amp; auto-borrow
                                  </span>
                                )}
                            </div>

                            {sos.suggestions.length === 0 ? (
                              <p className="text-[11px] text-muted italic">
                                No suggestions yet — help a bestie out!
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {sos.suggestions.map((sug) => {
                                  const isAccepted = sug.status === "accepted";
                                  return (
                                    <div
                                      key={sug.id}
                                      className={cn(
                                        "flex items-center gap-2.5 rounded-xl border p-2 bg-white transition",
                                        isAccepted
                                          ? "border-emerald-300 bg-emerald-50/50"
                                          : "border-border-neutral"
                                      )}
                                    >
                                      <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-border-neutral bg-chalk">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={sug.itemImageUrl}
                                          alt={sug.itemTitle}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-french-navy truncate">
                                          {sug.itemTitle}
                                        </p>
                                        <p className="font-mono text-[10px] text-muted truncate">
                                          From{" "}
                                          {sug.suggester_id === currentUserId
                                            ? "You"
                                            : sug.suggesterName}
                                        </p>
                                        {isAccepted && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                                            <Check size={10} /> Accepted
                                          </span>
                                        )}
                                      </div>

                                      {isMySos && !hasAccepted && (
                                        <button
                                          type="button"
                                          disabled={
                                            isAcceptingSuggestion === sug.id
                                          }
                                          onClick={() =>
                                            handleAcceptSuggestion(
                                              sug.id,
                                              sug.itemTitle
                                            )
                                          }
                                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-french-navy px-2.5 py-1.5 text-[10px] font-bold text-white shadow-2xs hover:bg-french-navy-hover active:scale-95 transition disabled:opacity-50"
                                        >
                                          {isAcceptingSuggestion === sug.id ? (
                                            <Loader2
                                              size={11}
                                              className="animate-spin"
                                            />
                                          ) : (
                                            <Check size={11} />
                                          )}
                                          <span>Accept</span>
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Peer Suggest Button */}
                          {!isMySos && (
                            <div className="pt-1 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => setSelectedSosForSuggest(sos)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-french-navy px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-french-navy-hover active:scale-95 transition"
                              >
                                <Sparkles size={13} className="text-dusty-lilac" />
                                <span>Suggest Item</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                    onClick={() => handleSwitchViewTab("closet")}
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
                    const isSharedOutfit =
                      act.action_type === "shared_outfit" && act.targetOutfit;

                    if (isSharedOutfit && act.targetOutfit) {
                      const lookbook = act.targetOutfit;
                      const nonOwnedCount = lookbook.items.filter(
                        (i) => i.owner_id !== currentUserId
                      ).length;

                      return (
                        <div
                          key={act.id}
                          onClick={() =>
                            router.push(
                              `/outfits/${lookbook.id}?from=/sharedrobe/${circle.id}`
                            )
                          }
                          className="group cursor-pointer overflow-hidden rounded-2xl border-2 border-dusty-lilac bg-gradient-to-br from-dusty-lilac/25 via-chalk to-buttercream p-4 shadow-md transition hover:border-french-navy/50 hover:shadow-lg"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-dusty-lilac px-2.5 py-1 font-mono text-[9px] font-extrabold uppercase tracking-wider text-white shadow-2xs">
                              <Layers className="h-3.5 w-3.5" />
                              LOOKBOOK CARD // YAY OR NAY POLL ✨
                            </span>
                            <span className="font-mono text-[10px] font-bold text-muted">
                              {formatRelativeTime(act.created_at)}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-extrabold text-midnight-slate group-hover:text-french-navy">
                                {lookbook.title}
                              </h3>
                              <p className="mt-0.5 text-[11px] font-medium text-graphite">
                                Styled by{" "}
                                <span className="font-bold text-midnight-slate">
                                  {lookbook.creatorId === currentUserId
                                    ? "You"
                                    : lookbook.creatorName}
                                </span>{" "}
                                • {lookbook.items.length}{" "}
                                {lookbook.items.length === 1
                                  ? "piece"
                                  : "pieces"}
                              </p>
                            </div>

                            <Link
                              href={`/outfits/${lookbook.id}?from=/sharedrobe/${circle.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-french-navy px-2.5 py-1.5 font-mono text-[10px] font-bold text-white shadow-2xs transition hover:bg-french-navy-hover"
                            >
                              <span>
                                {nonOwnedCount > 0
                                  ? "Open & Borrow Fit →"
                                  : "Open Fit →"}
                              </span>
                            </Link>
                          </div>

                          {/* Garment Collage Strip */}
                          {lookbook.items.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                              {lookbook.items.map((piece) => (
                                <div
                                  key={piece.id}
                                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-dusty-lilac/40 bg-buttercream shadow-2xs"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={piece.image_url}
                                    alt={piece.title}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Prominent 👍 Yay and 👎 Nay Vote Tally Buttons */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 grid grid-cols-2 gap-2 border-t border-dusty-lilac/30 pt-3"
                          >
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                handleVoteOnLookbook(lookbook.id, "yay")
                              }
                              className={cn(
                                "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-extrabold transition active:scale-95",
                                lookbook.myVote === "yay"
                                  ? "border-2 border-emerald-600 bg-emerald-600 text-white shadow-xs"
                                  : "border-border-strong bg-buttercream text-midnight-slate hover:border-emerald-500"
                              )}
                            >
                              {activeActionId === `${lookbook.id}-yay` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ThumbsUp className="h-3.5 w-3.5" />
                              )}
                              <span>👍 Yay ({lookbook.yayCount})</span>
                            </button>

                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                handleVoteOnLookbook(lookbook.id, "nay")
                              }
                              className={cn(
                                "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-extrabold transition active:scale-95",
                                lookbook.myVote === "nay"
                                  ? "border-2 border-rose-600 bg-rose-600 text-white shadow-xs"
                                  : "border-border-strong bg-buttercream text-midnight-slate hover:border-rose-500"
                              )}
                            >
                              {activeActionId === `${lookbook.id}-nay` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ThumbsDown className="h-3.5 w-3.5" />
                              )}
                              <span>👎 Nay ({lookbook.nayCount})</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (isPublicNudge) {
                      const targetGarment = act.target_item_id
                        ? items.find((i) => i.id === act.target_item_id) || null
                        : null;
                      const canResolveDrama =
                        act.actor_id === currentUserId ||
                        currentUserRole === "admin" ||
                        targetGarment?.owner_id === currentUserId ||
                        targetGarment?.borrowed_by === currentUserId;

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

                          {canResolveDrama && (
                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/25 pt-3">
                              <span className="font-mono text-[10px] font-semibold text-white/90">
                                Item back safe &amp; sound?
                              </span>
                              <button
                                type="button"
                                disabled={
                                  isPending &&
                                  activeActionId === `resolve-act-${act.id}`
                                }
                                onClick={() =>
                                  handleResolveDrama({
                                    itemId: act.target_item_id,
                                    activityId: act.id,
                                    actionKey: `resolve-act-${act.id}`,
                                  })
                                }
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-french-navy px-3 py-1.5 text-[11px] font-extrabold text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                              >
                                {isPending &&
                                activeActionId === `resolve-act-${act.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5 text-emerald-300 stroke-[3]" />
                                )}
                                <span>🕊️ Resolve Drama &amp; Mark Returned</span>
                              </button>
                            </div>
                          )}
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

      {/* Manage Circle Members Modal */}
      {isManageMembersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-slate/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-circle-members-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
                  CIRCLE ROSTER // {circle.name}
                </p>
                <h2
                  id="manage-circle-members-title"
                  className="mt-0.5 text-base font-extrabold text-midnight-slate"
                >
                  {currentUserRole === "admin"
                    ? "Manage Circle Members"
                    : "Circle Members"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsManageMembersOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border-neutral bg-chalk text-muted transition hover:text-midnight-slate"
                aria-label="Close member management"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {members.map((member) => {
                const isMe = member.userId === currentUserId;
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
                    className="flex items-center justify-between gap-2.5 rounded-2xl border border-border-neutral bg-chalk p-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-buttercream text-xs font-extrabold text-french-navy">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-midnight-slate">
                            {isMe ? `${member.fullName} (You)` : member.fullName}
                          </p>
                          {member.role === "admin" && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-french-navy/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-french-navy">
                              <Shield className="h-2.5 w-2.5" />
                              ADMIN
                            </span>
                          )}
                        </div>
                        <p className="truncate font-mono text-[10px] text-muted">
                          {count} shared {count === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </div>

                    {currentUserRole === "admin" &&
                      !isMe &&
                      member.role !== "admin" && (
                        <button
                          type="button"
                          disabled={
                            isPending && activeActionId === member.userId
                          }
                          onClick={() => handleRemoveMember(member)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          {isPending && activeActionId === member.userId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserMinus className="h-3 w-3" />
                          )}
                          <span>Remove</span>
                        </button>
                      )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-neutral pt-3.5">
              {currentUserRole !== "admin" ? (
                <button
                  type="button"
                  disabled={isPending && activeActionId === "leave-circle"}
                  onClick={handleLeaveCircle}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  {isPending && activeActionId === "leave-circle" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  <span>Leave Circle</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsManageMembersOpen(false);
                    setIsAddFriendsOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-french-navy px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-french-navy-hover"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>+ Invite Friends</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsManageMembersOpen(false)}
                className="rounded-xl border border-border-neutral bg-chalk px-3.5 py-2 text-xs font-bold text-midnight-slate transition hover:border-french-navy"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Ask the Group (SOS) Modal */}
      {isSosModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-slate/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-modal-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-border-neutral bg-buttercream p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                  <Siren className="h-4 w-4 animate-pulse" />
                </span>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-600">
                    EMERGENCY OUTFIT REQUEST
                  </p>
                  <h2
                    id="sos-modal-title"
                    className="text-base font-extrabold text-midnight-slate"
                  >
                    Ask the Group (SOS)
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSosModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border-neutral bg-chalk text-muted transition hover:text-midnight-slate"
                aria-label="Close SOS modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted">
              Broadcast an urgent outfit need to your circle besties. Anyone in the circle can pitch garments from their closet to help you out!
            </p>

            <form onSubmit={handleCreateSos} className="mt-4 space-y-3.5">
              <div>
                <label className="block font-mono text-[10px] font-bold uppercase text-midnight-slate">
                  What do you need / what&apos;s the event?
                </label>
                <textarea
                  required
                  rows={3}
                  value={sosEventDescription}
                  onChange={(e) => setSosEventDescription(e.target.value)}
                  placeholder="e.g. Wedding guest outfit this Saturday! Looking for a jewel-toned slip dress or chic jumpsuit size S/M."
                  className="mt-1 w-full rounded-xl border border-border-strong bg-chalk p-2.5 text-xs text-midnight-slate placeholder:text-muted focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] font-bold uppercase text-midnight-slate">
                  Target Date (When do you need it by?)
                </label>
                <div className="relative mt-1">
                  <input
                    type="date"
                    required
                    value={sosTargetDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setSosTargetDate(e.target.value)}
                    className="w-full rounded-xl border border-border-strong bg-chalk px-3 py-2 text-xs font-semibold text-midnight-slate focus:border-rose-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-neutral">
                <button
                  type="button"
                  onClick={() => setIsSosModalOpen(false)}
                  className="rounded-xl border border-border-neutral bg-chalk px-3.5 py-2 text-xs font-bold text-midnight-slate transition hover:border-french-navy"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingSos ||
                    sosEventDescription.trim().length < 3 ||
                    !sosTargetDate
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingSos ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Siren className="h-3.5 w-3.5" />
                  )}
                  <span>Broadcast SOS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suggest Item Bottom Drawer */}
      {selectedSosForSuggest && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-slate/60 backdrop-blur-xs p-0 sm:items-center sm:p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggest-item-drawer-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[32px] sm:rounded-[32px] border border-border-neutral bg-buttercream p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border-neutral pb-3">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dusty-lilac">
                  HELP A BESTIE // SUGGEST ITEM
                </p>
                <h2
                  id="suggest-item-drawer-title"
                  className="mt-0.5 text-base font-extrabold text-midnight-slate"
                >
                  Suggest for {selectedSosForSuggest.requesterName}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  &ldquo;{selectedSosForSuggest.event_description}&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSosForSuggest(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-neutral bg-chalk text-muted transition hover:text-midnight-slate"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 pr-1">
              {myAvailableItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac">
                    <Shirt className="h-5 w-5" />
                  </div>
                  <h3 className="mt-2 text-xs font-bold text-midnight-slate">
                    No Available Items in Your Closet
                  </h3>
                  <p className="mt-1 text-[11px] text-muted">
                    Only your garments currently marked &ldquo;Available&rdquo; can be suggested.
                  </p>
                  <Link
                    href="/?action=add_item"
                    className="mt-3 inline-flex items-center gap-1 rounded-xl bg-french-navy px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-french-navy-hover transition"
                  >
                    + Add New Item
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {myAvailableItems.map((garment) => {
                    const alreadySuggested = selectedSosForSuggest.suggestions.some(
                      (s) => s.item_id === garment.id
                    );
                    const isSuggesting = isSuggestingItemId === garment.id;

                    return (
                      <div
                        key={garment.id}
                        className={cn(
                          "flex flex-col overflow-hidden rounded-2xl border bg-chalk transition",
                          alreadySuggested
                            ? "border-emerald-300 opacity-60"
                            : "border-border-neutral hover:border-french-navy hover:shadow-2xs"
                        )}
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-buttercream">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={garment.image_url}
                            alt={garment.title}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute top-1.5 left-1.5 rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-french-navy shadow-2xs">
                            {garment.category}
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col justify-between p-2.5">
                          <p className="truncate text-xs font-bold text-midnight-slate">
                            {garment.title}
                          </p>
                          <div className="mt-2">
                            {alreadySuggested ? (
                              <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-50 py-1.5 text-[10px] font-bold text-emerald-700">
                                <Check size={11} /> Suggested
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isSuggesting || isSuggestingItemId !== null}
                                onClick={() =>
                                  handleSuggestItem(garment.id, garment.title)
                                }
                                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-french-navy py-1.5 text-[10px] font-bold text-white shadow-2xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                              >
                                {isSuggesting ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Sparkles size={11} className="text-dusty-lilac" />
                                )}
                                <span>Pitch Item</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border-neutral pt-3">
              <button
                type="button"
                onClick={() => setSelectedSosForSuggest(null)}
                className="w-full rounded-xl border border-border-neutral bg-chalk py-2 text-xs font-bold text-midnight-slate transition hover:border-french-navy"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
