-- CreateEnum
CREATE TYPE "Sensor" AS ENUM ('MODIS', 'VIIRS');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'NOMINAL', 'HIGH');

-- CreateEnum
CREATE TYPE "DayNight" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('REAL', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('CSV', 'FIRMS_API');

-- CreateEnum
CREATE TYPE "DistrictAssignment" AS ENUM ('PENDING', 'ASSIGNED', 'OUTSIDE', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "districts" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "geom" geometry(MultiPolygon, 4326) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "source" "ImportSource" NOT NULL,
    "file_name" TEXT,
    "checksum" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "origin" "DataOrigin" NOT NULL,
    "rows_total" INTEGER NOT NULL,
    "inserted" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "sensor" "Sensor" NOT NULL,
    "platform" "Platform" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "confidence_raw" TEXT NOT NULL,
    "confidence_level" "ConfidenceLevel",
    "brightness_k" DOUBLE PRECISION,
    "brightness_aux_k" DOUBLE PRECISION,
    "frp_mw" DOUBLE PRECISION,
    "scan" DOUBLE PRECISION,
    "track" DOUBLE PRECISION,
    "day_night" "DayNight",
    "product_version" TEXT,
    "origin" "DataOrigin" NOT NULL,
    "raw" JSONB NOT NULL,
    "district_assignment" "DistrictAssignment" NOT NULL DEFAULT 'PENDING',
    "district_id" INTEGER,
    "batch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "districts_geom_idx" ON "districts" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "import_batches_checksum_idx" ON "import_batches"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "observations_dedupe_key_key" ON "observations"("dedupe_key");

-- CreateIndex
CREATE INDEX "observations_acquired_at_idx" ON "observations"("acquired_at");

-- CreateIndex
CREATE INDEX "observations_sensor_acquired_at_idx" ON "observations"("sensor", "acquired_at");

-- CreateIndex
CREATE INDEX "observations_district_id_acquired_at_idx" ON "observations"("district_id", "acquired_at");

-- CreateIndex
CREATE INDEX "observations_batch_id_idx" ON "observations"("batch_id");

-- CreateIndex
CREATE INDEX "observations_geom_idx" ON "observations" USING GIST ("geom");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
