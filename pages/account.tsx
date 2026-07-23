import { useState } from "react";
import type { GetServerSideProps } from "next";
import Header from "@/components/Header";
import MfaSection from "@/components/account/MfaSection";
import TrustedDevices from "@/components/account/TrustedDevices";
import MySuggestions from "@/components/account/MySuggestions";
import { getSessionForRequest } from "@/lib/auth/server";

interface Props {
  name: string;
  email: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return {
      redirect: { destination: "/login?callbackUrl=%2Faccount", permanent: false },
    };
  }
  return {
    props: {
      name: session.user.name ?? "",
      email: session.user.email ?? "",
    },
  };
};

export default function AccountPage({ name, email }: Props) {
  // Bump to refetch the device list after MFA is toggled (disable revokes all).
  const [devicesKey, setDevicesKey] = useState(0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-10">
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
          Account
        </h1>
        <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
          {name ? `${name} · ${email}` : email}
        </p>

        <div className="space-y-6">
          <MfaSection onChanged={() => setDevicesKey((k) => k + 1)} />
          <TrustedDevices refreshKey={devicesKey} />
          <MySuggestions />
        </div>
      </main>
    </div>
  );
}
