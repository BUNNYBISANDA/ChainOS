-- Phase 2: outbound supply-chain loop (Customer -> Sales Order -> Reservation
-- -> Outbound Shipment -> Fulfillment). Renames the phase 1 CustomerOrder
-- stub in place (verified zero rows in customer_orders/customer_order_lines
-- before writing this migration) rather than dropping and recreating, and
-- renames the affected constraints/indexes to match so they don't drift
-- from Prisma's naming convention.

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ALLOCATED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');

-- RenameTable
ALTER TABLE "customer_orders" RENAME TO "sales_orders";
ALTER TABLE "customer_order_lines" RENAME TO "sales_order_lines";

-- RenameConstraint/Index to match the renamed tables
ALTER TABLE "sales_orders" RENAME CONSTRAINT "customer_orders_pkey" TO "sales_orders_pkey";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "customer_orders_customerId_fkey" TO "sales_orders_customerId_fkey";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "customer_orders_tenantId_fkey" TO "sales_orders_tenantId_fkey";
ALTER TABLE "sales_orders" RENAME CONSTRAINT "customer_orders_warehouseId_fkey" TO "sales_orders_warehouseId_fkey";
ALTER INDEX "customer_orders_tenantId_idx" RENAME TO "sales_orders_tenantId_idx";

ALTER TABLE "sales_order_lines" RENAME CONSTRAINT "customer_order_lines_pkey" TO "sales_order_lines_pkey";
ALTER TABLE "sales_order_lines" RENAME CONSTRAINT "customer_order_lines_productId_fkey" TO "sales_order_lines_productId_fkey";
ALTER INDEX "customer_order_lines_tenantId_idx" RENAME TO "sales_order_lines_tenantId_idx";

-- RenameColumn: sales_order_lines.customerOrderId -> salesOrderId
ALTER TABLE "sales_order_lines" RENAME COLUMN "customerOrderId" TO "salesOrderId";
ALTER TABLE "sales_order_lines" RENAME CONSTRAINT "customer_order_lines_customerOrderId_fkey" TO "sales_order_lines_salesOrderId_fkey";

-- RenameColumn: shipments.customerOrderId -> salesOrderId
ALTER TABLE "shipments" RENAME COLUMN "customerOrderId" TO "salesOrderId";
ALTER TABLE "shipments" RENAME CONSTRAINT "shipments_customerOrderId_fkey" TO "shipments_salesOrderId_fkey";
ALTER INDEX "shipments_customerOrderId_key" RENAME TO "shipments_salesOrderId_key";

-- RenameColumn: stock_movements.customerOrderLineId -> salesOrderLineId
ALTER TABLE "stock_movements" RENAME COLUMN "customerOrderLineId" TO "salesOrderLineId";
ALTER TABLE "stock_movements" RENAME CONSTRAINT "stock_movements_customerOrderLineId_fkey" TO "stock_movements_salesOrderLineId_fkey";

-- AlterTable: customers — rename name -> companyName, add phase 2 fields
ALTER TABLE "customers" RENAME COLUMN "name" TO "companyName";
ALTER TABLE "customers"
  ADD COLUMN "customerCode" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- No existing rows to backfill, so customerCode/updatedAt can go straight to NOT NULL
ALTER TABLE "customers" ALTER COLUMN "customerCode" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE UNIQUE INDEX "customers_tenantId_customerCode_key" ON "customers"("tenantId", "customerCode");

-- AlterTable: sales_orders — swap the status enum, add phase 2 columns
ALTER TABLE "sales_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sales_orders" ALTER COLUMN "status" TYPE "SalesOrderStatus" USING ('DRAFT'::"SalesOrderStatus");
ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "CustomerOrderStatus";

ALTER TABLE "sales_orders"
  ADD COLUMN "orderNumber" TEXT,
  ADD COLUMN "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "requestedDeliveryDate" TIMESTAMP(3),
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'THB',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "confirmedByUserId" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "sales_orders" ALTER COLUMN "orderNumber" SET NOT NULL;
ALTER TABLE "sales_orders" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE UNIQUE INDEX "sales_orders_tenantId_orderNumber_key" ON "sales_orders"("tenantId", "orderNumber");

-- AlterTable: sales_order_lines — add phase 2 columns
ALTER TABLE "sales_order_lines"
  ADD COLUMN "qtyReserved" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "unitPrice" DECIMAL(12,2);
ALTER TABLE "sales_order_lines" ALTER COLUMN "unitPrice" SET NOT NULL;

-- AlterTable: shipments — outbound destination customer
ALTER TABLE "shipments" ADD COLUMN "destCustomerId" TEXT;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_destCustomerId_fkey" FOREIGN KEY ("destCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: inventory_reservations
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fulfilledQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_reservations_salesOrderLineId_key" ON "inventory_reservations"("salesOrderLineId");
CREATE INDEX "inventory_reservations_tenantId_idx" ON "inventory_reservations"("tenantId");
CREATE INDEX "inventory_reservations_productId_warehouseId_idx" ON "inventory_reservations"("productId", "warehouseId");

ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
