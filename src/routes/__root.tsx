import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Shell } from "@/components/ascension/shell";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function BookSequenceController() {
  useEffect(() => {
    let animationFrame = 0;
    let timers: number[] = [];

    const clearSequenceTimers = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
      window.cancelAnimationFrame(animationFrame);
    };

    const resetBook = (world: HTMLElement) => {
      clearSequenceTimers();
      delete world.dataset["bookSequence"];
      delete world.dataset["bookStep"];
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const label = target.textContent?.trim().toUpperCase() ?? "";
      if (!label.includes("ENGAGE ASCENSION")) return;

      const world = target.closest(".ascension-world");
      if (!(world instanceof HTMLElement)) return;

      clearSequenceTimers();
      world.dataset["bookSequence"] = "rocking";
      world.dataset["bookStep"] = "0";

      const holdTop = Math.max(0, window.scrollY + world.getBoundingClientRect().top);
      const started = performance.now();
      const holdBookInView = (now: number) => {
        if (now - started < 5900) {
          window.scrollTo({ top: holdTop, behavior: "auto" });
          animationFrame = window.requestAnimationFrame(holdBookInView);
        }
      };
      animationFrame = window.requestAnimationFrame(holdBookInView);

      timers.push(
        window.setTimeout(() => {
          world.dataset["bookSequence"] = "opening";
        }, 1650),
      );

      timers.push(
        window.setTimeout(() => {
          world.dataset["bookSequence"] = "emerging";
          world.dataset["bookStep"] = "1";
        }, 2450),
      );

      [2920, 3390, 3860, 4330, 4800].forEach((delay, index) => {
        timers.push(
          window.setTimeout(() => {
            world.dataset["bookStep"] = String(index + 2);
          }, delay),
        );
      });

      timers.push(
        window.setTimeout(() => {
          world.dataset["bookSequence"] = "tree";
          world.dataset["bookStep"] = "6";
        }, 5350),
      );
    };

    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || target.id !== "objective") return;
      const world = target.closest(".ascension-world");
      if (world instanceof HTMLElement && world.dataset["bookSequence"] === "tree") {
        resetBook(world);
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      clearSequenceTimers();
    };
  }, []);

  return null;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "ASCENSION" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "google-site-verification",
        content: "IJl6kRhhAMirryZyAocQ-33sbsFHe2GdS3jMhxiXWQQ",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter+Tight:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <BookSequenceController />
      <Shell>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </Shell>
    </QueryClientProvider>
  );
}
