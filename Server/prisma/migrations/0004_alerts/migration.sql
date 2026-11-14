-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'IN_ANALYSIS', 'VERIFIED');

-- CreateEnum
CREATE TYPE "AlertMode" AS ENUM ('LIVE', 'REPLAY');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "mode" "AlertMode" NOT NULL,
    "origin" "DataOrigin" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "area_id" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "in_park" BOOLEAN NOT NULL,
    "sensor" "Sensor" NOT NULL,
    "platform" "Platform" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "detection_count" INTEGER NOT NULL,
    "max_frp_mw" DOUBLE PRECISION,
    "confidence_level" "ConfidenceLevel",
    "confidence_raw" TEXT,
    "message" TEXT NOT NULL,
    "note" TEXT,
    "observation_ids" UUID[],
    "batch_id" UUID,
    "status_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_number_key" ON "alerts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupe_key_key" ON "alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "alerts_detected_at_idx" ON "alerts"("detected_at");

-- CreateIndex
CREATE INDEX "alerts_severity_detected_at_idx" ON "alerts"("severity", "detected_at");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_area_id_detected_at_idx" ON "alerts"("area_id", "detected_at");
