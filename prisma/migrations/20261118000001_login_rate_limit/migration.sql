CREATE TABLE "LoginRateLimit" (
  "ipHash" TEXT NOT NULL PRIMARY KEY,
  "windowStart" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL
);

CREATE INDEX "LoginRateLimit_windowStart_idx" ON "LoginRateLimit" ("windowStart");
