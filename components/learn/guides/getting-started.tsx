import type { GuideSection } from "@/lib/learn/registry";
import { Step } from "@/components/learn/Step";
import { Figure } from "@/components/learn/Figure";
import { Callout } from "@/components/learn/Callout";

export const sections: GuideSection[] = [
  { id: "create-account", label: "Create your account" },
  { id: "invites", label: "Joining from an invite" },
  { id: "sign-in", label: "Signing in & security" },
  { id: "find-your-way", label: "Finding your way around" },
];

export default function GettingStarted() {
  return (
    <div>
      <Step num={1} id="create-account" title="Create your account">
        <p>
          Head to the <strong className="text-foreground">Sign up</strong> page and enter your name, email, and a
          password. That&apos;s the whole form — you can start following teams immediately.
        </p>
        <Figure src="/learn/signup.png" alt="The Stacked Bench sign-up page" caption="Sign up — name, email, password" />
        <Callout variant="note">
          Some leagues run with administrator approval turned on. If yours does, you&apos;ll see a &quot;Pending
          approval&quot; screen after signup until an admin lets you in — nothing is wrong with your account.
        </Callout>
      </Step>

      <Step num={2} id="invites" title="Joining from an invite">
        <p>
          If a league operator or coach invited you, use the link in the invite email instead of signing up cold. The
          invite carries your role with it — accept it and you&apos;ll land with the right team or league access already
          in place, no waiting for someone to grant permissions afterwards.
        </p>
      </Step>

      <Step num={3} id="sign-in" title="Signing in & security">
        <p>
          Sign in with your email and password from any device — everything lives in the browser, so there&apos;s
          nothing to install.
        </p>
        <p>
          For extra protection, you can turn on <strong className="text-foreground">two-step verification</strong> from
          your Account page. With it enabled, signing in on a new device asks for a one-time code sent to your email.
        </p>
      </Step>

      <Step num={4} id="find-your-way" title="Finding your way around">
        <p>The header is the whole map:</p>
        <ul className="list-none space-y-2">
          <li><strong className="text-foreground">Home</strong> — your followed teams, leagues, and tournaments.</li>
          <li><strong className="text-foreground">Tournaments</strong> — browse or run tournaments and brackets.</li>
          <li><strong className="text-foreground">Leagues</strong> — leagues, divisions, seasons, schedules, standings.</li>
          <li><strong className="text-foreground">Teams</strong> — team pages with rosters and calendars.</li>
          <li><strong className="text-foreground">Scrimmages</strong> — a marketplace for finding practice games.</li>
          <li><strong className="text-foreground">Bracket Builder</strong> — a standalone tool for quick brackets.</li>
        </ul>
        <Figure src="/learn/home-follows.png" alt="The home page with followed teams and leagues" caption="Home — everything you follow, one tap deep" />
      </Step>
    </div>
  );
}
