import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const ADDED_SHIELD = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");

function addShield(headers: Headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "SAMEORIGIN");
  const existing = headers.get("content-security-policy");
  headers.set("content-security-policy", existing ? `${existing}; ${ADDED_SHIELD}` : ADDED_SHIELD);
}

/** Adds response shields. CSRF and the error page stay in front of this. */
const shieldMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  if (result instanceof Response) {
    addShield(result.headers);
    return result;
  }
  if (result && typeof result === "object" && "response" in result && result.response instanceof Response) {
    addShield(result.response.headers);
  }
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware, shieldMiddleware],
}));
