ARG APP=api

FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS deps
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18
ARG APP
ENV NODE_ENV=production
ENV PORT=3000
ENV STANDCAST_APP=${APP}
WORKDIR /app
COPY --from=deps --chown=bun:bun /app /app
USER bun
EXPOSE 3000
CMD ["sh", "-c", "case \"$STANDCAST_APP\" in api) bun run db:migrate && exec bun run apps/api/src/main.ts ;; worker) exec bun run apps/worker/src/main.ts ;; *) echo \"APP must be api or worker\" >&2; exit 1 ;; esac"]
