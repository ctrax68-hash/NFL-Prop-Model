"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettleButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function settle() {
    setStatus("working");
    setMessage("");
    try {
      const response = await fetch("/api/bets/settle", { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as {
        settled: number;
        voided: number;
        stillPending: number;
      };
      setMessage(
        `${result.settled} graded, ${result.voided} void, ${result.stillPending} still open.`,
      );
      setStatus("idle");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not settle bets.",
      );
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={settle}
        disabled={status === "working"}
        className="rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-semibold hover:border-[var(--border-strong)] disabled:opacity-60"
      >
        {status === "working" ? "Grading…" : "Grade open bets"}
      </button>
      {message ? (
        <p
          className={
            status === "error"
              ? "mt-1 text-[11px] text-[var(--ember)]"
              : "mt-1 text-[11px] text-[var(--ink-mute)]"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
