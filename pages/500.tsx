import Link from "next/link";
import Head from "next/head";
import { Button } from "@/components/ui/button";

function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong — StackedBench</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-md text-center">
          <p
            className="text-7xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            500
          </p>
          <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We hit an unexpected error on our end. Please try again in a moment.
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

// Render outside AuthGate — an error page should never show an auth spinner.
ServerErrorPage.disableAuthGate = true;

export default ServerErrorPage;
