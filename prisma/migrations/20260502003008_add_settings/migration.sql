-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" DATETIME NOT NULL
);
