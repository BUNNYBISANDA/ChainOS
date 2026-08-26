-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- CreateIndex
CREATE INDEX "goods_receipts_tenantId_receivedAt_idx" ON "goods_receipts"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_status_idx" ON "purchase_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierId_idx" ON "purchase_orders"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_expectedDeliveryDate_idx" ON "purchase_orders"("tenantId", "expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "sales_orders_tenantId_status_idx" ON "sales_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_orders_tenantId_customerId_idx" ON "sales_orders"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "sales_orders_tenantId_requestedDeliveryDate_idx" ON "sales_orders"("tenantId", "requestedDeliveryDate");

-- CreateIndex
CREATE INDEX "shipments_tenantId_status_idx" ON "shipments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "shipments_tenantId_direction_idx" ON "shipments"("tenantId", "direction");

-- CreateIndex
CREATE INDEX "shipments_tenantId_estimatedArrivalAt_idx" ON "shipments"("tenantId", "estimatedArrivalAt");

-- CreateIndex
CREATE INDEX "shipments_tenantId_deliveredAt_idx" ON "shipments"("tenantId", "deliveredAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt");
