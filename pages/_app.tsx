import "../src/styles/globals.css";
import "../src/styles/fullcalendar-overrides.css";
import type { AppProps } from "next/app";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import AdminLoginRedirect from "@/components/AdminLoginRedirect";
import AuthGate from "@/components/AuthGate";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${barlowCondensed.variable} ${dmSans.variable}`}>
      <AuthGate>
        <AdminLoginRedirect />
        <Component {...pageProps} />
      </AuthGate>
    </main>
  );
}
