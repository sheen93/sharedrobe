"use client";

import { useActionState, useState } from "react";
import {
  User,
  Mail,
  Lock,
  Save,
  ShieldCheck,
  Database,
  KeyRound,
  LogOut,
  X,
  Check,
} from "lucide-react";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";
import FieldCard from "@/components/ui/FieldCard";
import IconInput from "@/components/ui/IconInput";
import SubmitButton from "@/components/ui/SubmitButton";
import FormMessage from "@/components/ui/FormMessage";
import BottomNav from "@/components/BottomNav";
import { updateProfile, updatePassword, signOut } from "./actions";
import { createInitialFormState } from "@/utils/auth/form-state";

interface ProfileClientProps {
  initialFullName: string;
  email: string;
  updatedAt?: string;
}

export default function ProfileClient({
  initialFullName,
  email,
  updatedAt,
}: ProfileClientProps) {
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [profileState, profileAction] = useActionState(
    updateProfile,
    createInitialFormState<"fullName">()
  );

  const [passwordState, passwordAction] = useActionState(
    updatePassword,
    createInitialFormState<"password" | "confirmPassword">()
  );

  const formatLastUpdated = (dateStr?: string) => {
    if (!dateStr) return "Last updated recently";
    try {
      const date = new Date(dateStr);
      return `Last updated on ${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    } catch {
      return "Last updated recently";
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-linen sm:py-6">
      {/* Responsive App Shell: Full-width on mobile devices, centered card on desktops */}
      <main className="flex w-full max-w-md flex-1 flex-col bg-buttercream p-4 pb-28 sm:rounded-[32px] sm:border sm:border-border-neutral sm:p-5 sm:shadow-2xl">
        {/* App Header */}
        <ScreenHeader
          meta="USER // ACCOUNT"
          title="Profile"
          action={
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-french-navy"
              title="Verified Account"
            >
              <ShieldCheck className="h-4 w-4 text-french-navy" />
            </div>
          }
        />

        {/* Minimal Header Note */}
        <InfoBar
          icon={Database}
          label="MVP User Record (3 Fields)"
          className="mt-3"
        />

        {/* Main Form Area (Strictly 3 Fields: Name, Email, Password) */}
        <div className="mt-4 space-y-4">
          {profileState.message && (
            <FormMessage
              tone={profileState.status === "error" ? "error" : "success"}
            >
              {profileState.message}
            </FormMessage>
          )}

          <form action={profileAction} className="space-y-4">
            {/* Field 1: Name */}
            <FieldCard
              label="Name"
              htmlFor="profile-name"
              meta="Required"
              helper="Displayed to circle friends in shared wardrobes."
              error={profileState.fieldErrors.fullName}
            >
              <IconInput
                id="profile-name"
                name="fullName"
                type="text"
                required
                defaultValue={profileState.values.fullName ?? initialFullName}
                placeholder="Sophia Chen"
                icon={User}
                invalid={Boolean(profileState.fieldErrors.fullName)}
              />
            </FieldCard>

            {/* Field 2: Email */}
            <FieldCard
              label="Email"
              htmlFor="profile-email"
              meta="Verified"
              helper="Used for authentication and share requests."
            >
              <IconInput
                id="profile-email"
                name="email"
                type="email"
                value={email}
                readOnly
                icon={Mail}
              />
            </FieldCard>

            {/* Save / Update MVP Action */}
            <div className="pt-1">
              <SubmitButton
                pendingLabel="Updating Credentials..."
                icon={Save}
                className="w-full"
              >
                Update Credentials
              </SubmitButton>
            </div>
          </form>

          {/* Field 3: Password with modal/drawer trigger */}
          <div className="rounded-2xl border border-border-neutral bg-chalk p-4 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-french-navy">
              <span>Password</span>
              <span className="font-mono text-[10px] font-bold text-dusty-lilac">
                ••••••••
              </span>
            </div>
            <div className="relative">
              <input
                type="password"
                value="••••••••••••"
                readOnly
                className="w-full rounded-xl border border-border-strong bg-buttercream py-2.5 pr-10 pl-3.5 font-mono text-sm tracking-widest text-midnight-slate focus:outline-none"
              />
              <div className="pointer-events-none absolute top-3 right-3 text-muted">
                <Lock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-muted">
                {formatLastUpdated(updatedAt)}
              </p>
              <button
                type="button"
                onClick={() => setIsChangingPassword(!isChangingPassword)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-french-navy transition hover:bg-white hover:text-dusty-lilac"
              >
                <KeyRound className="h-3.5 w-3.5 text-dusty-lilac" />
                <span>{isChangingPassword ? "Cancel" : "Change Password"}</span>
              </button>
            </div>

            {/* Change Password Panel */}
            {isChangingPassword && (
              <form
                action={passwordAction}
                className="mt-3 space-y-3 border-t border-border-neutral/70 pt-3"
              >
                {passwordState.message && (
                  <FormMessage
                    tone={passwordState.status === "error" ? "error" : "success"}
                  >
                    {passwordState.message}
                  </FormMessage>
                )}

                <div>
                  <label
                    htmlFor="new-password"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-french-navy"
                  >
                    New Password
                  </label>
                  <IconInput
                    id="new-password"
                    name="password"
                    type="password"
                    required
                    placeholder="At least 8 characters"
                    icon={Lock}
                    invalid={Boolean(passwordState.fieldErrors.password)}
                  />
                  {passwordState.fieldErrors.password && (
                    <p className="mt-1 text-[11px] font-semibold text-red-700">
                      {passwordState.fieldErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-french-navy"
                  >
                    Confirm Password
                  </label>
                  <IconInput
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    required
                    placeholder="Re-enter new password"
                    icon={Check}
                    invalid={Boolean(passwordState.fieldErrors.confirmPassword)}
                  />
                  {passwordState.fieldErrors.confirmPassword && (
                    <p className="mt-1 text-[11px] font-semibold text-red-700">
                      {passwordState.fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <SubmitButton
                    pendingLabel="Updating..."
                    icon={Save}
                    className="flex-1 py-2 text-[11px]"
                  >
                    Save Password
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setIsChangingPassword(false)}
                    className="flex items-center justify-center rounded-xl border border-border-neutral bg-white px-3 py-2 text-xs font-semibold text-muted hover:text-midnight-slate"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Sign Out Action */}
          <div className="pt-2">
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-neutral bg-chalk py-2.5 text-xs font-bold uppercase tracking-wider text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Persistent Bottom Nav with Profile active */}
      <BottomNav />
    </div>
  );
}
