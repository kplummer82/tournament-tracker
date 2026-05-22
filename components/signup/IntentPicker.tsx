import type { SignupIntent } from "@/lib/auth/permissions";

interface Option {
  intent: SignupIntent;
  label: string;
}

const OPTIONS: Option[] = [
  { intent: "follower", label: "I want to follow a team or league" },
  { intent: "coach", label: "I coach or manage a team" },
  { intent: "league_operator", label: "I run a league" },
  { intent: "tournament_organizer", label: "I'm running a tournament" },
];

interface Props {
  onPick: (intent: SignupIntent) => void;
}

export function IntentPicker({ onPick }: Props) {
  return (
    <div className="max-w-md w-full mx-auto">
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
      <p
        className="text-sm text-muted-foreground mb-8"
        style={{ fontFamily: "var(--font-body)" }}
      >
        First, tell us what brings you here.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.intent}
            type="button"
            data-testid={`intent-${opt.intent}`}
            onClick={() => onPick(opt.intent)}
            className="text-left border border-border bg-card hover:border-primary hover:bg-elevated transition-colors duration-100 px-4 py-5 text-sm text-foreground cursor-pointer"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
