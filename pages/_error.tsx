import Link from "next/link";
import Head from "next/head";
import type { NextPageContext } from "next";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  statusCode: number | null;
}

/**
 * Generic error page for statuses without a dedicated page (404.tsx / 500.tsx
 * cover the common ones). Also renders for client-side rendering errors.
 */
function ErrorPage({ statusCode }: ErrorProps) {
  const title = statusCode
    ? `Error ${statusCode} — StackedBench`
    : "Error — StackedBench";
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-md text-center">
          <p
            className="text-7xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {statusCode ?? "Error"}
          </p>
          <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {statusCode
              ? `An error ${statusCode} occurred. Please try again.`
              : "An unexpected error occurred. Please try again."}
          </p>
          <div className="mt-6 flex items-center justify-center">
            <Button asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? null;
  return { statusCode };
};

// Render outside AuthGate — an error page should never show an auth spinner.
ErrorPage.disableAuthGate = true;

export default ErrorPage;
