"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Card } from "./ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    // Without a try/catch here, anything that throws instead of returning
    // `{ error }` — a malformed Supabase URL, a blocked request, a dropped
    // connection — left the button stuck on "Sending..." forever with no way
    // to tell the user what happened or let them retry.
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("sent");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong sending the sign-in link. Please try again.",
      );
    }
  }

  if (status === "sent") {
    return (
      <Card hud className="px-6 py-10 text-center">
        <h2 className="display text-lg font-bold text-[var(--ink)]">
          Check your email
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-dim)]">
          We sent a sign-in link to <span className="font-semibold text-[var(--ink)]">{email}</span>.
          Open it on this device to finish signing in.
        </p>
      </Card>
    );
  }

  return (
    <Card hud className="px-6 py-8">
      <h2 className="display text-lg font-bold text-[var(--ink)]">Sign in</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
        Enter your email and we&apos;ll send you a sign-in link. No password needed.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          // 16px keeps iOS Safari from zooming the page on focus, matching
          // the board's search input.
          className="min-h-[44px] w-full rounded-[var(--radius-pill)] border border-[var(--border)] bg-[rgba(32,26,36,0.6)] px-4 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-mute)] focus:border-[var(--gold)]"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="tap min-h-[44px] rounded-[var(--radius-pill)] px-4 text-sm font-bold text-[#04101f] transition-opacity disabled:opacity-60"
          style={{
            background: "linear-gradient(180deg, var(--gold-bright), var(--gold))",
            boxShadow: "var(--glow-gold)",
          }}
        >
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
        {status === "error" && message ? (
          <p role="alert" className="text-xs text-[var(--ember)]">
            {message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
