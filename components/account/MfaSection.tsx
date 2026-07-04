"use client";

import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

/**
 * Two-step verification card: enable (send code → verify code) / disable.
 * Enabling requires entering an emailed code, which doubles as proof the
 * user's email actually receives our mail.
 */
export default function MfaSection({ onChanged }: { onChanged?: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    fetch("/api/mfa/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setEnabled(d.enabled === true))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendEnableCode = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose: "enable" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStage("code");
        setCooldown(data.resendCooldownSeconds ?? 60);
        setInfo("Code sent — check your email.");
      } else if (data.code === "already_enabled") {
        setEnabled(true);
        setStage("idle");
      } else if (data.code === "resend_cooldown") {
        setStage("code");
        setCooldown(data.retryAfterSeconds ?? 60);
        setInfo("A code was already sent — check your email.");
      } else if (data.code === "email_send_failed") {
        setError("We couldn't send the code email. Try again in a moment.");
      } else if (data.code === "too_many_requests") {
        setError("Too many codes requested. Try again later.");
      } else {
        setError(data.error ?? "Failed to send the code.");
      }
    } catch {
      setError("Failed to send the code.");
    }
    setBusy(false);
  };

  const verifyEnableCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose: "enable", code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEnabled(true);
        setStage("idle");
        setCode("");
        setInfo(null);
        onChanged?.();
      } else if (data.code === "invalid_code") {
        const n = data.attemptsRemaining;
        setError(
          n != null
            ? `That code isn't right. ${n} attempt${n === 1 ? "" : "s"} remaining.`
            : "That code isn't right."
        );
        setCode("");
      } else if (data.code === "code_expired" || data.code === "too_many_attempts") {
        setError(
          data.code === "code_expired"
            ? "That code has expired. Resend a new one."
            : "Too many incorrect attempts. Resend a new code."
        );
        setCode("");
      } else {
        setError(data.error ?? "Verification failed.");
      }
    } catch {
      setError("Verification failed.");
    }
    setBusy(false);
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa/disable", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setEnabled(false);
        setStage("idle");
        onChanged?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to turn off two-step verification.");
      }
    } catch {
      setError("Failed to turn off two-step verification.");
    }
    setBusy(false);
    setDisableOpen(false);
  };

  return (
    <section className="border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="label-section" style={{ fontSize: "13px" }}>
          Two-Step Verification
        </h2>
        {enabled !== null && (
          <span
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase border ${
              enabled
                ? "text-success border-success/30 bg-success/10"
                : "text-muted-foreground border-border bg-muted"
            }`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {enabled ? "On" : "Off"}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
        When on, signing in requires a 6-digit code sent to your email in
        addition to your password.
      </p>

      {info && !error && (
        <p className="mb-4 text-sm text-success border border-success/30 bg-success/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
          {info}
        </p>
      )}
      {error && (
        <p className="mb-4 text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      )}

      {enabled === null ? (
        <div className="h-9 w-40 bg-border animate-pulse" />
      ) : enabled ? (
        <button
          type="button"
          onClick={() => setDisableOpen(true)}
          disabled={busy}
          className="border border-border bg-muted text-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-80 disabled:opacity-40 transition-opacity duration-100"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Turn off
        </button>
      ) : stage === "idle" ? (
        <button
          type="button"
          onClick={sendEnableCode}
          disabled={busy}
          className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {busy ? "Sending code…" : "Turn on"}
        </button>
      ) : (
        <form onSubmit={verifyEnableCode} className="space-y-3 max-w-xs">
          <div>
            <label className="label-section mb-1.5 block">Enter the emailed code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              className={`${INPUT_STYLE} text-center text-xl tracking-[0.4em]`}
              placeholder="000000"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {busy ? "Verifying…" : "Verify & turn on"}
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={sendEnableCode}
              className="text-sm text-primary hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
            </button>
          </div>
        </form>
      )}

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
              Turn off two-step verification?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: "var(--font-body)" }}>
              Signing in will only require your password. All trusted devices
              will be forgotten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Turning off…" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
