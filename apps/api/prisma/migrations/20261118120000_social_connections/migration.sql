-- DEC-014: una sola tabla de conexiones. Migracion A: crea y copia. Las tablas viejas
-- (meta_connections, threads_connections) se conservan hasta la migracion B.

-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('META', 'THREADS');

-- Renombre del enum de estado (las columnas de las tablas viejas lo siguen)
ALTER TYPE "MetaConnectionStatus" RENAME TO "ConnectionStatus";

-- CreateTable
CREATE TABLE "social_connections" (
    "id" TEXT NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRefreshedAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_connections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN "connectionId" TEXT;

-- CreateIndex
CREATE INDEX "social_connections_provider_status_tokenExpiresAt_idx" ON "social_connections"("provider", "status", "tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_connections_provider_externalId_key" ON "social_connections"("provider", "externalId");

-- CreateIndex
CREATE INDEX "social_accounts_connectionId_idx" ON "social_accounts"("connectionId");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "social_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copia de datos: los tokens ya cifrados pasan tal cual (misma TOKEN_ENC_KEY)
-- Meta: una sola conexion vigente (la mas reciente). El token largo de Meta no se renueva.
INSERT INTO "social_connections" ("id", "provider", "externalId", "displayName", "tokenEnc", "tokenExpiresAt", "tokenRefreshedAt", "status", "lastSyncedAt", "createdAt", "updatedAt")
SELECT "id", 'META', "fbUserId", "fbUserName", "userTokenEnc", "userTokenExpiresAt", NULL, "status", "lastSyncedAt", "createdAt", "updatedAt"
FROM "meta_connections"
ORDER BY "createdAt" DESC
LIMIT 1;

INSERT INTO "social_connections" ("id", "provider", "externalId", "displayName", "tokenEnc", "tokenExpiresAt", "tokenRefreshedAt", "status", "createdAt", "updatedAt")
SELECT "id", 'THREADS', "threadsUserId", "username", "tokenEnc", "tokenExpiresAt", "tokenRefreshedAt", "status", "createdAt", "updatedAt"
FROM "threads_connections";

-- Cuentas ya existentes: FB e IG a la conexion de Meta; Threads a la de su perfil
UPDATE "social_accounts" a
SET "connectionId" = c."id"
FROM "social_connections" c
WHERE c."provider" = 'META' AND a."network" IN ('FACEBOOK', 'INSTAGRAM');

UPDATE "social_accounts" a
SET "connectionId" = c."id"
FROM "social_connections" c
WHERE c."provider" = 'THREADS' AND a."network" = 'THREADS' AND c."externalId" = a."externalId";
