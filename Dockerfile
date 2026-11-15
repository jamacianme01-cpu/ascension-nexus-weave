# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="TanStack"

# The Bun image defaults to /home/bun/app. The server file has to live on a
# fixed path because Fly starts `bun .output/server/index.mjs`.
WORKDIR /app

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*

# Vite and Nitro are dev dependencies. Install them before the production build.
COPY bun.lock package-lock.json package.json ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV NITRO_PRESET=bun
RUN bun run build \
    && test -f /app/.output/server/index.mjs

FROM base

# Copy the built app, then copy the dot-directory again so the server entry
# cannot be dropped on the way into the runtime image.
COPY --from=build /app /app
COPY --from=build /app/.output /app/.output
RUN test -f /app/.output/server/index.mjs

ENV NODE_ENV=production
ENV PORT=8080
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
EXPOSE 8080

# Bun's image entrypoint rewrites relative commands. Run the server file directly.
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["/app/.output/server/index.mjs"]
