import "@/lib/polyfills";
import "../src/styles/globals.css";
import "../src/styles/fullcalendar-overrides.css";
import type { AppProps } from "next/app";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import AdminLoginRedirect from "@/components/AdminLoginRedirect";
import AuthGate from "@/components/AuthGate";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";

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
  // Error pages (404/500/_error) opt out of AuthGate so a broken or missing
  // route renders its branded page immediately — no auth spinner, no login
  // bounce. Keyed off a static flag (stable across server + client) rather than
  // router.pathname, which is unreliable for the 404 page and would otherwise
  // cause a hydration mismatch.
  const skipAuthGate =
    (Component as { disableAuthGate?: boolean }).disableAuthGate === true;

  return (
    <ThemeProvider>
      <main className={`${barlowCondensed.variable} ${dmSans.variable}`}>
        {skipAuthGate ? (
          <Component {...pageProps} />
        ) : (
          <AuthGate>
            <AdminLoginRedirect />
            <ErrorBoundary>
              <Component {...pageProps} />
            </ErrorBoundary>
          </AuthGate>
        )}
      </main>
    </ThemeProvider>
  );
}
