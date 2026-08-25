-- Row-level security for ChainOS. Run once after the first `prisma migrate
-- dev`, then re-run (or fold into a migration) whenever a new tenant-scoped
-- table is added.
--
-- How it works: every API request resolves the caller's tenant, then the
-- request's DB transaction runs `SET LOCAL app.tenant_id = '<uuid>'` before
-- any query (see packages/database/src/index.ts -> withTenant()). Postgres
-- then silently filters every statement against that tenant, even if the
-- application query forgets a WHERE clause.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'roles', 'products', 'suppliers', 'supplier_products',
      'purchase_orders', 'purchase_order_lines', 'warehouses', 'locations',
      'stock_levels', 'stock_movements', 'customers', 'customer_orders',
      'customer_order_lines', 'shipments', 'shipment_events',
      'refresh_tokens', 'processed_events', 'goods_receipts',
      'goods_receipt_lines', 'number_sequences', 'audit_logs'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("tenantId" = current_setting(''app.tenant_id'', true)::text)
         WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::text)',
      t
    );
  END LOOP;
END $$;

-- The app's database role must NOT have BYPASSRLS, and should not be the
-- table owner (owners bypass RLS by default) — connect as a separate,
-- least-privilege role in every environment, including local dev.
