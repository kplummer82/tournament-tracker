import Header from "@/components/Header";
import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserSignupIntent } from "@/lib/auth/profile";

interface Props {
  noun: "league" | "tournament" | "account";
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  const intent = await getUserSignupIntent(session.user.id);
  let noun: Props["noun"] = "account";
  if (intent === "league_operator") noun = "league";
  if (intent === "tournament_organizer") noun = "tournament";
  return { props: { noun } };
};

export default function WelcomePending({ noun }: Props) {
  const headline =
    noun === "account"
      ? "Your account is awaiting approval."
      : `Thanks for signing up to run a ${noun}.`;
  const sub =
    noun === "account"
      ? "We'll email you when you're approved."
      : `Your account is awaiting approval. We'll email you when you're approved.`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-16">
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
          {headline}
        </h1>
        <p
          className="text-base text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {sub}
        </p>
      </main>
    </div>
  );
}
