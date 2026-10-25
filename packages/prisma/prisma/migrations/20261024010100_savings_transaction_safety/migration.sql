-- Legacy transactions remain unlabelled (NULL); no history is inferred.
ALTER TABLE "savings_transactions" ADD COLUMN "is_simulation" BOOLEAN;
ALTER TABLE "withdrawal_transactions" ADD COLUMN "is_simulation" BOOLEAN;
-- CreateTable
CREATE TABLE "savings_requests" (
    "key" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "transaction_id" TEXT,
    "response" JSONB,
    "event" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_requests_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "savings_points_receipts" (
    "transaction_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_points_receipts_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "savings_requests_transaction_id_key" ON "savings_requests"("transaction_id");

-- AddForeignKey
ALTER TABLE "savings_points_receipts" ADD CONSTRAINT "savings_points_receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "savings_transactions"("savings_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;
