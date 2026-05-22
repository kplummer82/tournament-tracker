import { useState } from "react";
import type { SignupIntent } from "@/lib/auth/permissions";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const VERB_PHRASE: Record<SignupIntent, string> = {
  follower: "follow a team",
  coach: "coach",
  league_operator: "run your league",
  tournament_organizer: "run your tournament",
};

const SUBMIT_LABEL: Record<SignupIntent, string> = {
  follower: "Sign up to follow your team",
  coach: "Sign up to coach",
  league_operator: "Sign up to run your league",
  tournament_organizer: "Sign up to run your tournament",
};

interface Props {
  intent: SignupIntent;
  /** When present, the email field is pre-filled and read-only (invite branch). */
  prefilledEmail?: string;
  onChangeIntent: () => void;
  onSubmit: (values: { name: string; email: string; password: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function CredentialsForm({
  intent,
  prefilledEmail,
  onChangeIntent,
  onSubmit,
  loading,
  error,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefilledEmail ?? "");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, email, password });
  };

  return (
    <div className="max-w-sm w-full mx-auto">
      <div
        className="mb-6 inline-flex items-center gap-3 border border-border bg-card px-3 py-1.5 text-xs"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <span className="text-muted-foreground">
          Signing up to <span className="text-foreground font-semibold">{VERB_PHRASE[intent]}</span>
        </span>
        {!prefilledEmail && (
          <button
            type="button"
            onClick={onChangeIntent}
            className="text-primary hover:opacity-80 transition-opacity duration-100 cursor-pointer"
            data-testid="change-intent"
          >
            Change
          </button>
        )}
      </div>

      <h1
        className="mb-1"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "32px",
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
        }}
      >
        Create Account
      </h1>
      <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
        Get started — it only takes a minute.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-section mb-1.5 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className={INPUT_STYLE}
            placeholder="Your full name"
          />
        </div>
        <div>
          <label className="label-section mb-1.5 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            readOnly={!!prefilledEmail}
            autoComplete="email"
            className={INPUT_STYLE}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label-section mb-1.5 block">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={INPUT_STYLE}
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p
            className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="submit-credentials"
          className="w-full bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100 mt-2"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {loading ? "Creating account…" : SUBMIT_LABEL[intent]}
        </button>
      </form>
    </div>
  );
}
