import Link from "next/link";
import Head from "next/head";
import { Button } from "@/components/ui/button";

function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found — StackedBench</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-md text-center">
          <p
            className="text-7xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            404
          </p>
          <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
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

// Render outside AuthGate — a missing route should never show an auth spinner.
NotFoundPage.disableAuthGate = true;

export default NotFoundPage;
