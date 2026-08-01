import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-wide error boundary. Catches render/lifecycle exceptions anywhere below
 * it so a single throwing component degrades to a branded fallback instead of a
 * blank white screen. Wraps the routed page in `_app.tsx`.
 *
 * NOTE: error boundaries must be class components — there is no hook equivalent.
 * `reportError` is the single hook for wiring an error tracker (e.g. Sentry)
 * later; today it logs to the console (which reaches Vercel function/runtime
 * logs).
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Single place to forward to an error tracker when one is added.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-md text-center">
          <p
            className="text-6xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Something broke
          </p>
          <h1 className="mt-4 text-xl font-semibold">
            This part of the app hit an unexpected error
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The rest of StackedBench is fine. Try again, or head back to the
            dashboard.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button onClick={this.handleReset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
