-- AlterEnum
ALTER TYPE "Network" ADD VALUE 'THREADS';

-- CreateTable
CREATE TABLE "threads_connections" (
    "id" TEXT NOT NULL,
    "threadsUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threads_connections_threadsUserId_key" ON "threads_connections"("threadsUserId");
