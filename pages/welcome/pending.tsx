import PendingApprovalScreen from "@/components/PendingApprovalScreen";
import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserStatus } from "@/lib/auth/profile";

interface Props {
  email: string;
}

/**
 * Post-signup landing for users awaiting approval. Renders the exact same
 * component AuthGate shows on later visits, so the "right after signup" and
 * "navigate back" messages are identical. Active users have no business here —
 * bounce them home.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  const status = await getUserStatus(session.user.id);
  if (status === "active") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { email: session.user.email ?? "" } };
};

export default function WelcomePending({ email }: Props) {
  return <PendingApprovalScreen email={email || undefined} />;
}
