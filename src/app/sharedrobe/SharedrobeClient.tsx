"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Share2,
  Plus,
  Users,
  UserCheck,
  UserPlus,
  UserMinus,
  LogOut,
  Search,
  Check,
  X,
  Clock,
  FolderArchive,
  Loader2,
  Shield,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";
import BottomNav from "@/components/BottomNav";
import CreateCircleModal from "@/components/CreateCircleModal";
import AddFriendsToCircleModal from "@/components/AddFriendsToCircleModal";
import { cn } from "@/utils/cn";
import {
  sendFriendRequest,
  respondToFriendRequest,
  requestJoinCircle,
  respondToCircleMemberRequest,
  removeCircleMember,
  leaveCircle,
  searchSocial,
  type SocialSearchResult,
} from "./actions";

export interface CircleItemPreview {
  id: string;
  title: string;
  category: string;
  image_url: string;
  owner_id: string;
  status?: string;
  borrowed_by?: string | null;
  borrowerName?: string | null;
}

export interface CircleMemberSummary {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: "admin" | "member";
  isCurrentUser: boolean;
}

export interface UserCircleData {
  id: string;
  name: string;
  description: string | null;
  role: "admin" | "member";
  status: "approved" | "pending";
  memberCount: number;
  sharedItemCount: number;
  items?: CircleItemPreview[];
  memberUserIds?: string[];
  members?: CircleMemberSummary[];
}

export interface UserFriendData {
  id: string;
  friendshipId: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface PendingFriendRequestData {
  friendshipId: string;
  requesterId: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface OutgoingFriendRequestData {
  friendshipId: string;
  addresseeId: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface PendingCircleRequestData {
  membershipId: string;
  circleId: string;
  circleName: string;
  requesterId: string;
  fullName: string;
  email: string;
  createdAt: string;
}

interface SharedrobeClientProps {
  initialCircles: UserCircleData[];
  initialFriends: UserFriendData[];
  initialIncomingFriendRequests: PendingFriendRequestData[];
  initialOutgoingFriendRequests: OutgoingFriendRequestData[];
  initialIncomingCircleRequests: PendingCircleRequestData[];
}

export default function SharedrobeClient({
  initialCircles,
  initialFriends,
  initialIncomingFriendRequests,
  initialOutgoingFriendRequests,
  initialIncomingCircleRequests,
}: SharedrobeClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"circles" | "friends" | "search">("circles");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [addFriendsModalCircle, setAddFriendsModalCircle] = useState<UserCircleData | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "people" | "circles">("all");
  const [searchResults, setSearchResults] = useState<SocialSearchResult>({
    profiles: [],
    circles: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Feedback banner state
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  // Expanded circle items view state
  const [expandedCircleId, setExpandedCircleId] = useState<string | null>(null);

  // Pending action transitions
  const [isPending, startTransition] = useTransition();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const totalPendingRequests =
    initialIncomingFriendRequests.length + initialIncomingCircleRequests.length;

  const approvedCircles = initialCircles.filter((c) => c.status === "approved");
  const pendingCircles = initialCircles.filter((c) => c.status === "pending");

  // Debounced search effect (asynchronous callback updates only)
  useEffect(() => {
    if (activeTab !== "search") return;

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      const res = await searchSocial(trimmed);
      if (res.success && res.data) {
        setSearchResults(res.data);
      }
      setIsSearching(false);
      setHasSearched(true);
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length >= 2) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
      setHasSearched(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults({ profiles: [], circles: [] });
    setHasSearched(false);
    setIsSearching(false);
  };

  const isQueryActive = searchQuery.trim().length >= 2;
  const displayedProfiles = isQueryActive ? searchResults.profiles : [];
  const displayedCircles = isQueryActive ? searchResults.circles : [];

  const showFeedback = (tone: "success" | "error", text: string) => {
    setActionFeedback({ tone, text });
    setTimeout(() => {
      setActionFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Actions
  const handleRespondFriend = (
    friendshipId: string,
    action: "accept" | "decline"
  ) => {
    setActiveActionId(friendshipId);
    startTransition(async () => {
      const res = await respondToFriendRequest(friendshipId, action);
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleRespondCircleMember = (
    membershipId: string,
    decision: "approve" | "reject"
  ) => {
    setActiveActionId(membershipId);
    startTransition(async () => {
      const res = await respondToCircleMemberRequest(membershipId, decision);
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", res.message);
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleSendFriendRequest = (profileId: string) => {
    setActiveActionId(profileId);
    startTransition(async () => {
      const res = await sendFriendRequest(profileId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback(
          "success",
          res.notificationSent
            ? `${res.message} Notification email sent.`
            : res.message
        );
        setSearchResults((prev) => ({
          ...prev,
          profiles: prev.profiles.map((p) =>
            p.id === profileId
              ? { ...p, friendshipStatus: "pending_sent" }
              : p
          ),
        }));
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleRequestJoinCircle = (circleId: string) => {
    setActiveActionId(circleId);
    startTransition(async () => {
      const res = await requestJoinCircle(circleId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback(
          "success",
          res.notificationSent
            ? `${res.message} Admin notified by email.`
            : res.message
        );
        setSearchResults((prev) => ({
          ...prev,
          circles: prev.circles.map((c) =>
            c.id === circleId ? { ...c, membershipStatus: "pending" } : c
          ),
        }));
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleRemoveCircleMember = (
    circleId: string,
    membershipId: string,
    memberName: string
  ) => {
    setActiveActionId(membershipId);
    startTransition(async () => {
      const res = await removeCircleMember(circleId, membershipId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback(
          "success",
          `${memberName} was removed from the circle.`
        );
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  const handleLeaveCircle = (circleId: string, circleName: string) => {
    setActiveActionId(`leave-${circleId}`);
    startTransition(async () => {
      const res = await leaveCircle(circleId);
      setActiveActionId(null);
      if (res.success) {
        showFeedback("success", `You have left "${circleName}".`);
        if (expandedCircleId === circleId) {
          setExpandedCircleId(null);
        }
        router.refresh();
      } else {
        showFeedback("error", res.error);
      }
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      {/* Responsive App Shell: Full-width on mobile devices, centered card on desktops */}
      <main className="relative flex w-full max-w-md flex-1 flex-col justify-between bg-buttercream sm:rounded-[32px] sm:border sm:border-border-neutral sm:shadow-2xl">
        <div className="flex-1 p-4 sm:p-5 pb-8 sm:pb-8">
          {/* Screen Header matching Stitch Screen 2 */}
        <ScreenHeader
          meta="CIRCULATION // SHARED"
          title="ShareDrobe"
          action={
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-french-navy text-white shadow-md transition active:scale-95 hover:bg-french-navy-hover"
              title="Create new circle"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </button>
          }
        />

        {/* Info strip */}
        <InfoBar
          icon={Share2}
          label="Circular Wardrobe Network"
          detail={`${approvedCircles.length} Circles • ${initialFriends.length} Friends`}
          iconClassName="text-french-navy"
          className="mt-3"
        />

        {/* Inline Feedback Banner */}
        {actionFeedback && (
          <div
            className={cn(
              "mt-3 flex items-center gap-2 rounded-xl border p-3 text-xs font-medium animate-in fade-in duration-200",
              actionFeedback.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            )}
          >
            {actionFeedback.tone === "success" ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
        )}

        {/* PROMINENT PENDING REQUESTS SECTION (Always visible when there are pending actions) */}
        {totalPendingRequests > 0 && (
          <section
            aria-label="Pending Requests"
            className="mt-3.5 rounded-2xl border border-dusty-lilac/30 bg-dusty-lilac/10 p-3.5 text-midnight-slate"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-french-navy text-white text-[10px] font-bold">
                  {totalPendingRequests}
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-french-navy">
                  Pending Action Requests
                </h3>
              </div>
              <span className="font-mono text-[10px] text-dusty-lilac font-bold">
                Requires Response
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {/* Incoming Friend Requests */}
              {initialIncomingFriendRequests.map((req) => (
                <div
                  key={req.friendshipId}
                  className="flex items-center justify-between rounded-xl border border-border-neutral bg-chalk p-2.5 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-french-navy text-[11px] font-bold text-white uppercase">
                      {req.fullName.slice(0, 2) || "FR"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-midnight-slate">
                        {req.fullName}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        Friend Request • {req.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      disabled={isPending && activeActionId === req.friendshipId}
                      onClick={() => handleRespondFriend(req.friendshipId, "accept")}
                      className="flex h-7 items-center gap-1 rounded-lg bg-french-navy px-2 text-[10px] font-bold text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                      title="Accept friend request"
                    >
                      {isPending && activeActionId === req.friendshipId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 stroke-[3]" />
                      )}
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      disabled={isPending && activeActionId === req.friendshipId}
                      onClick={() => handleRespondFriend(req.friendshipId, "decline")}
                      className="flex h-7 items-center justify-center rounded-lg border border-border-neutral bg-white px-2 text-[10px] font-bold text-muted transition hover:text-midnight-slate active:scale-95 disabled:opacity-50"
                      title="Decline friend request"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Incoming Circle Member Requests (Admin approval) */}
              {initialIncomingCircleRequests.map((req) => (
                <div
                  key={req.membershipId}
                  className="flex items-center justify-between rounded-xl border border-border-neutral bg-chalk p-2.5 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dusty-lilac text-[11px] font-bold text-white uppercase">
                      {req.fullName.slice(0, 2) || "CM"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-midnight-slate">
                        {req.fullName}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        Wants to join <strong>{req.circleName}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      disabled={isPending && activeActionId === req.membershipId}
                      onClick={() =>
                        handleRespondCircleMember(req.membershipId, "approve")
                      }
                      className="flex h-7 items-center gap-1 rounded-lg bg-french-navy px-2 text-[10px] font-bold text-white shadow-xs transition hover:bg-french-navy-hover active:scale-95 disabled:opacity-50"
                      title="Approve member to circle"
                    >
                      {isPending && activeActionId === req.membershipId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 stroke-[3]" />
                      )}
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={isPending && activeActionId === req.membershipId}
                      onClick={() =>
                        handleRespondCircleMember(req.membershipId, "reject")
                      }
                      className="flex h-7 items-center justify-center rounded-lg border border-border-neutral bg-white px-2 text-[10px] font-bold text-muted transition hover:text-midnight-slate active:scale-95 disabled:opacity-50"
                      title="Decline member request"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tabbed Segmented Switcher: 'My Circles' | 'My Friends' | 'Search' */}
        <div className="mt-3.5 flex rounded-xl border border-border-neutral bg-chalk p-1">
          <button
            type="button"
            onClick={() => setActiveTab("circles")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold tracking-tight transition flex items-center justify-center gap-1.5",
              activeTab === "circles"
                ? "bg-french-navy text-white shadow-sm"
                : "text-muted hover:text-french-navy"
            )}
          >
            <FolderArchive className="h-3.5 w-3.5" />
            <span>My Circles</span>
            {approvedCircles.length > 0 && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 font-mono text-[9px]",
                  activeTab === "circles"
                    ? "bg-white/20 text-white"
                    : "bg-buttercream text-french-navy"
                )}
              >
                {approvedCircles.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("friends")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold tracking-tight transition flex items-center justify-center gap-1.5",
              activeTab === "friends"
                ? "bg-french-navy text-white shadow-sm"
                : "text-muted hover:text-french-navy"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>My Friends</span>
            {initialFriends.length > 0 && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 font-mono text-[9px]",
                  activeTab === "friends"
                    ? "bg-white/20 text-white"
                    : "bg-buttercream text-french-navy"
                )}
              >
                {initialFriends.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold tracking-tight transition flex items-center justify-center gap-1.5",
              activeTab === "search"
                ? "bg-french-navy text-white shadow-sm"
                : "text-muted hover:text-french-navy"
            )}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
          </button>
        </div>

        {/* TAB 1: MY CIRCLES */}
        {activeTab === "circles" && (
          <div className="mt-4 flex-1 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                ACTIVE CIRCLES ({approvedCircles.length})
              </span>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1 font-mono text-[10px] font-bold text-french-navy hover:text-dusty-lilac transition"
              >
                <Plus size={11} strokeWidth={2.5} /> New Circle
              </button>
            </div>

            {/* Approved circles list */}
            {approvedCircles.length === 0 && pendingCircles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                  <FolderArchive className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                  No sharing circles yet
                </h3>
                <p className="mt-1 text-xs text-muted max-w-xs">
                  Create a circle for roommates, clubs, or friends to share and lend wardrobes together.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 flex items-center gap-1.5 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-french-navy-hover transition"
                >
                  <Plus size={14} /> Create a Circle
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {approvedCircles.map((circle) => {
                  const isExpanded = expandedCircleId === circle.id;
                  const circleMembers = circle.members || [];
                  const isCircleAdmin = circle.role === "admin";

                  return (
                    <div
                      key={circle.id}
                      className="group overflow-hidden rounded-2xl border border-border-neutral bg-chalk transition hover:border-dusty-lilac/70 shadow-xs"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCircleId(isExpanded ? null : circle.id)
                        }
                        className="w-full flex items-center justify-between p-3.5 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-buttercream text-french-navy transition group-hover:bg-french-navy group-hover:text-white">
                            <FolderArchive className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-sm font-bold text-midnight-slate truncate">
                                {circle.name}
                              </h4>
                              {isCircleAdmin && (
                                <span className="inline-flex items-center gap-0.5 rounded border border-french-navy/20 bg-french-navy/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-french-navy">
                                  <Shield size={9} /> ADMIN
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted truncate">
                              {circle.description ||
                                `${circle.sharedItemCount} shared ${
                                  circle.sharedItemCount === 1 ? "look" : "looks"
                                } • ${circle.memberCount} ${
                                  circle.memberCount === 1 ? "member" : "members"
                                }`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-muted transition duration-200",
                              isExpanded && "rotate-90 text-french-navy"
                            )}
                          />
                        </div>
                      </button>

                      {/* Expandable Circle Member Avatars & Role Controls (Garments only shown inside the Circle Closet) */}
                      {isExpanded && (
                        <div className="border-t border-border-neutral/60 bg-buttercream/50 p-3.5 animate-in fade-in duration-150">
                          {/* Circle Member Management Bar */}
                          <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border-neutral/60">
                            <div className="flex items-center gap-1.5">
                              <Users size={12} className="text-dusty-lilac" />
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                                CIRCLE MEMBERS ({circleMembers.length || circle.memberCount})
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isCircleAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => setAddFriendsModalCircle(circle)}
                                  className="flex items-center gap-1 rounded-lg border border-border-neutral bg-chalk px-2.5 py-1 text-[10px] font-bold text-french-navy transition hover:bg-french-navy hover:text-white active:scale-95 shadow-2xs"
                                >
                                  <UserPlus size={11} strokeWidth={2.5} />
                                  <span>+ Add Friends</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={
                                    isPending &&
                                    activeActionId === `leave-${circle.id}`
                                  }
                                  onClick={() =>
                                    handleLeaveCircle(circle.id, circle.name)
                                  }
                                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-100 active:scale-95 shadow-2xs disabled:opacity-50"
                                >
                                  {isPending &&
                                  activeActionId === `leave-${circle.id}` ? (
                                    <Loader2
                                      size={11}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <LogOut size={11} strokeWidth={2.5} />
                                  )}
                                  <span>Leave Circle</span>
                                </button>
                              )}

                              <Link
                                href={`/sharedrobe/${circle.id}`}
                                className="flex items-center gap-1 rounded-lg bg-french-navy px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-french-navy-hover active:scale-95 shadow-xs"
                              >
                                <span>Enter Circle Closet →</span>
                              </Link>
                            </div>
                          </div>

                          {/* Small Round Member Profiles / Avatars */}
                          <div className="flex flex-wrap items-start gap-3 py-1">
                            {circleMembers.map((member) => {
                              const initial = (
                                member.fullName.trim()[0] ||
                                member.email.trim()[0] ||
                                "M"
                              ).toUpperCase();
                              const firstName = member.isCurrentUser
                                ? "You"
                                : member.fullName.split(" ")[0] || "Member";
                              const canRemoveMember =
                                isCircleAdmin && !member.isCurrentUser;

                              return (
                                <div
                                  key={member.membershipId}
                                  className="flex flex-col items-center text-center min-w-[56px]"
                                >
                                  <div className="relative">
                                    <div
                                      className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full border text-xs font-extrabold uppercase shadow-2xs",
                                        member.isCurrentUser
                                          ? "border-french-navy bg-french-navy text-white"
                                          : "border-border-strong bg-chalk text-french-navy"
                                      )}
                                      title={`${member.fullName} (${member.email})`}
                                    >
                                      {initial}
                                    </div>

                                    {member.role === "admin" && (
                                      <span
                                        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-dusty-lilac text-white shadow-2xs"
                                        title="Circle Admin"
                                      >
                                        <Shield size={8} />
                                      </span>
                                    )}
                                  </div>

                                  <span className="mt-1 max-w-[68px] truncate text-[10px] font-bold text-midnight-slate">
                                    {firstName}
                                  </span>

                                  {canRemoveMember && (
                                    <button
                                      type="button"
                                      disabled={
                                        isPending &&
                                        activeActionId === member.membershipId
                                      }
                                      onClick={() =>
                                        handleRemoveCircleMember(
                                          circle.id,
                                          member.membershipId,
                                          member.fullName
                                        )
                                      }
                                      className="mt-0.5 inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[8px] font-bold text-rose-700 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                                      title={`Remove ${member.fullName} from circle`}
                                    >
                                      {isPending &&
                                      activeActionId === member.membershipId ? (
                                        <Loader2
                                          size={8}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <UserMinus size={8} />
                                      )}
                                      <span>Remove</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Pending Circles Requested By User */}
                {pendingCircles.length > 0 && (
                  <div className="pt-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted px-1">
                      PENDING CIRCLE REQUESTS ({pendingCircles.length})
                    </span>
                    <div className="mt-2 space-y-2">
                      {pendingCircles.map((circle) => (
                        <div
                          key={circle.id}
                          className="flex items-center justify-between rounded-xl border border-dashed border-border-strong bg-chalk/60 p-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <Clock className="h-4 w-4 text-muted" />
                            <div>
                              <p className="text-xs font-bold text-midnight-slate">
                                {circle.name}
                              </p>
                              <p className="text-[10px] text-muted">
                                Request sent • Awaiting Admin approval
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] rounded bg-border-neutral/50 px-2 py-0.5 text-muted">
                            Pending
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY FRIENDS */}
        {activeTab === "friends" && (
          <div className="mt-4 flex-1 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                CONNECTED FRIENDS ({initialFriends.length})
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("search")}
                className="flex items-center gap-1 font-mono text-[10px] font-bold text-french-navy hover:text-dusty-lilac transition"
              >
                <UserPlus size={11} strokeWidth={2.5} /> Add Friends
              </button>
            </div>

            {initialFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-midnight-slate">
                  No friends connected yet
                </h3>
                <p className="mt-1 text-xs text-muted max-w-xs">
                  Connect with friends to share closet collections and invite each other to circles.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("search")}
                  className="mt-4 flex items-center gap-1.5 rounded-xl bg-french-navy px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-french-navy-hover transition"
                >
                  <Search size={14} /> Find & Add Friends
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {initialFriends.map((friend) => (
                  <div
                    key={friend.friendshipId}
                    className="flex items-center justify-between rounded-2xl border border-border-neutral bg-chalk p-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dusty-lilac text-white font-bold text-xs uppercase shadow-xs">
                        {friend.fullName.slice(0, 2) || "FR"}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-midnight-slate truncate">
                          {friend.fullName}
                        </h4>
                        <p className="text-[11px] text-muted truncate">
                          {friend.email}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shrink-0">
                      <UserCheck size={11} /> Connected
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Outgoing pending friend requests */}
            {initialOutgoingFriendRequests.length > 0 && (
              <div className="pt-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted px-1">
                  SENT FRIEND REQUESTS ({initialOutgoingFriendRequests.length})
                </span>
                <div className="mt-2 space-y-2">
                  {initialOutgoingFriendRequests.map((out) => (
                    <div
                      key={out.friendshipId}
                      className="flex items-center justify-between rounded-xl border border-dashed border-border-strong bg-chalk/60 p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Clock className="h-4 w-4 text-muted shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-midnight-slate">
                            {out.fullName}
                          </p>
                          <p className="truncate text-[10px] text-muted">
                            Request sent to {out.email}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-muted shrink-0">
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REAL-TIME FUZZY SEARCH */}
        {activeTab === "search" && (
          <div className="mt-4 flex-1 space-y-3">
            {/* Search Input Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search people by name/email or circles..."
                className="w-full rounded-xl border border-border-neutral bg-chalk py-2.5 pl-10 pr-9 text-xs text-midnight-slate placeholder:text-muted focus:border-dusty-lilac focus:outline-hidden"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-midnight-slate"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : isSearching ? (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-dusty-lilac" />
                </div>
              ) : null}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5">
              {(["all", "people", "circles"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setSearchFilter(filter)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition",
                    searchFilter === filter
                      ? "bg-french-navy text-white shadow-xs"
                      : "bg-chalk text-muted hover:text-midnight-slate"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Loading state indicator */}
            {isSearching && (
              <div className="flex items-center justify-center py-8 text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-dusty-lilac mr-2" />
                <span className="text-xs font-medium">Searching Share Drobe...</span>
              </div>
            )}

            {/* Initial empty state (before typing) */}
            {!searchQuery.trim() && !isSearching && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-neutral bg-chalk/60 p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-buttercream text-dusty-lilac shadow-sm">
                  <Search className="h-5 w-5" />
                </div>
                <h4 className="mt-2.5 text-xs font-bold text-midnight-slate">
                  Find Friends & Circles
                </h4>
                <p className="mt-1 text-[11px] text-muted max-w-xs">
                  Type at least 2 characters to search for fellow fashion lovers or public community sharing groups.
                </p>
              </div>
            )}

            {/* No users / circles found empty state */}
            {hasSearched &&
              !isSearching &&
              displayedProfiles.length === 0 &&
              displayedCircles.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-chalk p-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-buttercream text-muted shadow-sm">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <h4 className="mt-2.5 text-xs font-bold text-midnight-slate">
                    No results found
                  </h4>
                  <p className="mt-1 text-[11px] text-muted max-w-xs">
                    No members or circles matched &ldquo;{searchQuery}&rdquo;. Check spelling or create your own circle above.
                  </p>
                </div>
              )}

            {/* SEARCH RESULTS */}
            {!isSearching && (
              <div className="space-y-4">
                {/* Profiles Results */}
                {(searchFilter === "all" || searchFilter === "people") &&
                  displayedProfiles.length > 0 && (
                    <div className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted px-1">
                        PEOPLE ({displayedProfiles.length})
                      </span>
                      {displayedProfiles.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between rounded-2xl border border-border-neutral bg-chalk p-3 shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-french-navy text-white text-xs font-bold uppercase">
                              {profile.fullName.slice(0, 2) || "MB"}
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-midnight-slate truncate">
                                {profile.fullName}
                              </h5>
                              <p className="text-[10px] text-muted truncate">
                                {profile.email}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 ml-2">
                            {profile.friendshipStatus === "accepted" ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                                <UserCheck size={11} /> Friends
                              </span>
                            ) : profile.friendshipStatus === "pending_sent" ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-border-neutral bg-buttercream px-2 py-1 font-mono text-[10px] text-muted">
                                <Clock size={11} /> Requested
                              </span>
                            ) : profile.friendshipStatus === "pending_received" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  profile.friendshipId &&
                                  handleRespondFriend(profile.friendshipId, "accept")
                                }
                                className="flex items-center gap-1 rounded-lg bg-french-navy px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-french-navy-hover transition"
                              >
                                <Check size={11} /> Accept Request
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  isPending && activeActionId === profile.id
                                }
                                onClick={() => handleSendFriendRequest(profile.id)}
                                className="flex items-center gap-1 rounded-lg bg-french-navy px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-french-navy-hover active:scale-95 transition disabled:opacity-50"
                              >
                                {isPending && activeActionId === profile.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <UserPlus size={11} />
                                )}
                                <span>Add Friend</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Circles Results */}
                {(searchFilter === "all" || searchFilter === "circles") &&
                  displayedCircles.length > 0 && (
                    <div className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted px-1">
                        CIRCLES ({displayedCircles.length})
                      </span>
                      {displayedCircles.map((circle) => (
                        <div
                          key={circle.id}
                          className="flex items-center justify-between rounded-2xl border border-border-neutral bg-chalk p-3 shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-buttercream text-french-navy">
                              <FolderArchive className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-midnight-slate truncate">
                                {circle.name}
                              </h5>
                              <p className="text-[10px] text-muted truncate">
                                {circle.description || `${circle.memberCount} members`}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 ml-2">
                            {circle.membershipStatus === "approved" ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                                <Check size={11} /> Member
                              </span>
                            ) : circle.membershipStatus === "pending" ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-border-neutral bg-buttercream px-2 py-1 font-mono text-[10px] text-muted">
                                <Clock size={11} /> Pending
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isPending && activeActionId === circle.id}
                                onClick={() => handleRequestJoinCircle(circle.id)}
                                className="flex items-center gap-1 rounded-lg bg-french-navy px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-french-navy-hover active:scale-95 transition disabled:opacity-50"
                              >
                                {isPending && activeActionId === circle.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Plus size={11} strokeWidth={2.5} />
                                )}
                                <span>Join Circle</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Persistent Bottom Nav Docked as Part of the Screen */}
        <BottomNav />
      </main>

      {/* Create Circle Modal */}
      <CreateCircleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          showFeedback("success", "Circle created successfully!");
          router.refresh();
        }}
      />

      {/* Add Friends to Circle Modal */}
      <AddFriendsToCircleModal
        circle={addFriendsModalCircle}
        friends={initialFriends}
        isOpen={Boolean(addFriendsModalCircle)}
        onClose={() => setAddFriendsModalCircle(null)}
        onSuccess={(addedCount, circleName) => {
          showFeedback(
            "success",
            `Successfully added ${addedCount} ${
              addedCount === 1 ? "friend" : "friends"
            } to "${circleName}"!`
          );
          router.refresh();
        }}
        onSwitchToSearch={() => setActiveTab("search")}
      />
    </div>
  );
}
