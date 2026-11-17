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
    && test -f /app/.output/server/index.mjs \
    && python scripts/verify_fly_private_core.py .private_runtime \
    && PYTHONPATH=/app/.private_runtime python -c 'import ASCENSION_CORE.cloud_queue_worker; import ASCENSION_CORE.objective_runtime'

FROM base

# The worker executes the owner's existing Python ASCENSION_CORE. This private
# code is injected by the protected deployment workflow, not checked into GitHub.
RUN apt-get update -qq && apt-get install --no-install-recommends -y python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the built app, then copy the dot-directory again so the server entry
# cannot be dropped on the way into the runtime image.
COPY --from=build /app /app
COPY --from=build /app/.output /app/.output
# Preserve the owner's original core as an independent, private Python
# package. The worker imports the original engine modules unmodified.
COPY --from=build /app/.private_runtime/ASCENSION_CORE /app/ASCENSION_CORE
COPY --from=build /app/.private_runtime/clarity /app/clarity
COPY scripts/ascension-fly-entrypoint.sh /usr/local/bin/ascension-start
RUN test -f /app/.output/server/index.mjs \
    && test -f /app/ASCENSION_CORE/cloud_queue_worker.py \
    && test -f /app/clarity/core_runtime.py \
    && mkdir -p /home/bun/app \
    && ln -sfn /app/.output /home/bun/app/.output \
    && ln -sfn /app/.output /.output \
    && chmod 755 /usr/local/bin/ascension-start

ENV NODE_ENV=production
ENV PYTHONPATH=/app
ENV PORT=8080
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
WORKDIR /app
EXPOSE 8080

# Ignore a relative command appended by the Bun image entrypoint.
ENTRYPOINT ["/usr/local/bin/ascension-start"]
CMD ["web"]
