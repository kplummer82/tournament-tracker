import Header from "@/components/Header";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserStatus } from "@/lib/auth/profile";

interface Props {
  email: string;
  status: "active" | "inactive";
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  const status = await getUserStatus(session.user.id);
  return {
    props: {
      email: session.user.email ?? "",
      status,
    },
  };
};

export default function CoachWelcome({ email, status }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-16">
        {status === "inactive" && (
          <div
            className="mb-8 border border-primary/30 bg-primary/10 text-foreground px-4 py-3 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Your account is awaiting approval before you can be added to a team.
          </div>
        )}

        <h1
          className="mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "32px",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
          }}
        >
          You're in.
        </h1>

        <p
          className="text-base text-muted-foreground mb-6"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your account is created. A league operator needs to add you to a team before
          you can manage one. Share this email with them so they can find your account:
        </p>

        <p
          className="mb-10 px-4 py-3 border border-border bg-card text-foreground"
          style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}
        >
          {email}
        </p>

        <Link
          href="/tournaments"
          className="inline-block text-primary hover:opacity-80 transition-opacity duration-100 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Find a team to follow while you wait →
        </Link>
      </main>
    </div>
  );
}
