"use client";

import { useActionState, useState } from "react";
import { Mail, Lock, User, LogIn, UserPlus, Shirt, ShieldCheck } from "lucide-react";
import { signIn, signUp } from "./actions";
import { createInitialFormState } from "@/utils/auth/form-state";
import ScreenHeader from "@/components/ui/ScreenHeader";
import InfoBar from "@/components/ui/InfoBar";
import FieldCard from "@/components/ui/FieldCard";
import IconInput from "@/components/ui/IconInput";
import SubmitButton from "@/components/ui/SubmitButton";
import FormMessage from "@/components/ui/FormMessage";
import { cn } from "@/utils/cn";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [signInState, signInAction] = useActionState(
    signIn,
    createInitialFormState<"email" | "password">()
  );

  const [signUpState, signUpAction] = useActionState(
    signUp,
    createInitialFormState<"fullName" | "email" | "password">()
  );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-linen p-4 sm:p-6">
      {/* Visual Subtitle for Dev / Mockup fidelity */}
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <span className="rounded bg-french-navy px-2 py-0.5 text-[10px] text-white">
          AUTH
        </span>
        <span>Secure Closet Access</span>
      </div>

      {/* Mobile-sized shell matching Stitch Screen cards */}
      <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] border border-border-neutral bg-buttercream p-5 shadow-2xl">
        {/* App Header */}
        <ScreenHeader
          meta={mode === "signin" ? "AUTH // SIGN_IN" : "AUTH // SIGN_UP"}
          title={mode === "signin" ? "Welcome Back" : "Join ShareDrobe"}
          action={
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-neutral bg-chalk text-french-navy">
              {mode === "signin" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <Shirt className="h-4 w-4" />
              )}
            </div>
          }
        />

        {/* Info strip */}
        <InfoBar
          icon={Shirt}
          label={
            mode === "signin"
              ? "Access your digitized wardrobe"
              : "Create your circular closet database"
          }
          className="mt-3"
        />

        {/* Mode Segmented Switcher */}
        <div className="mt-4 flex rounded-xl border border-border-neutral bg-chalk p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold tracking-tight transition",
              mode === "signin"
                ? "bg-french-navy text-white shadow-sm"
                : "text-muted hover:text-french-navy"
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold tracking-tight transition",
              mode === "signup"
                ? "bg-french-navy text-white shadow-sm"
                : "text-muted hover:text-french-navy"
            )}
          >
            Create Account
          </button>
        </div>

        {/* Forms */}
        <div className="mt-5">
          {mode === "signin" ? (
            <form action={signInAction} className="space-y-4">
              {signInState.message && (
                <FormMessage
                  tone={signInState.status === "error" ? "error" : "success"}
                >
                  {signInState.message}
                </FormMessage>
              )}

              <FieldCard
                label="Email"
                htmlFor="signin-email"
                meta="Account"
                error={signInState.fieldErrors.email}
              >
                <IconInput
                  id="signin-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="sophia.chen@example.com"
                  defaultValue={signInState.values.email ?? ""}
                  icon={Mail}
                  invalid={Boolean(signInState.fieldErrors.email)}
                />
              </FieldCard>

              <FieldCard
                label="Password"
                htmlFor="signin-password"
                meta="••••••••"
                error={signInState.fieldErrors.password}
              >
                <IconInput
                  id="signin-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  icon={Lock}
                  invalid={Boolean(signInState.fieldErrors.password)}
                />
              </FieldCard>

              <div className="pt-2">
                <SubmitButton
                  pendingLabel="Signing in..."
                  icon={LogIn}
                  className="w-full"
                >
                  Sign In
                </SubmitButton>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-xs font-semibold text-muted hover:text-french-navy transition"
                >
                  New to Share Drobe?{" "}
                  <span className="text-french-navy underline decoration-dusty-lilac underline-offset-2">
                    Create an account
                  </span>
                </button>
              </div>
            </form>
          ) : (
            <form action={signUpAction} className="space-y-4">
              {signUpState.message && (
                <FormMessage
                  tone={signUpState.status === "error" ? "error" : "success"}
                >
                  {signUpState.message}
                </FormMessage>
              )}

              <FieldCard
                label="Name"
                htmlFor="signup-name"
                meta="Required"
                helper="Displayed to circle friends in shared wardrobes."
                error={signUpState.fieldErrors.fullName}
              >
                <IconInput
                  id="signup-name"
                  name="fullName"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Sophia Chen"
                  defaultValue={signUpState.values.fullName ?? ""}
                  icon={User}
                  invalid={Boolean(signUpState.fieldErrors.fullName)}
                />
              </FieldCard>

              <FieldCard
                label="Email"
                htmlFor="signup-email"
                meta="Required"
                helper="Used for authentication and share requests."
                error={signUpState.fieldErrors.email}
              >
                <IconInput
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="sophia.chen@example.com"
                  defaultValue={signUpState.values.email ?? ""}
                  icon={Mail}
                  invalid={Boolean(signUpState.fieldErrors.email)}
                />
              </FieldCard>

              <FieldCard
                label="Password"
                htmlFor="signup-password"
                meta="Min 8 chars"
                helper="Must be at least 8 characters long."
                error={signUpState.fieldErrors.password}
              >
                <IconInput
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  icon={Lock}
                  invalid={Boolean(signUpState.fieldErrors.password)}
                />
              </FieldCard>

              <div className="pt-2">
                <SubmitButton
                  pendingLabel="Creating Account..."
                  icon={UserPlus}
                  className="w-full"
                >
                  Create Account
                </SubmitButton>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-xs font-semibold text-muted hover:text-french-navy transition"
                >
                  Already have an account?{" "}
                  <span className="text-french-navy underline decoration-dusty-lilac underline-offset-2">
                    Sign in
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
