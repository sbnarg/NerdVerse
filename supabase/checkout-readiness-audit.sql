-- NerdVerse checkout readiness: READ ONLY. Export the Results as CSV.
-- 1: live table columns and types
SELECT 'column' AS kind, table_name AS object_name, column_name AS detail,
       data_type || CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END ||
       COALESCE(' DEFAULT ' || column_default,'') AS definition
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('products','orders','order_items','order_events','profiles','customers','customer_addresses','carts','cart_items','admin_users')
UNION ALL
-- 2: live constraints (including foreign keys and status checks)
SELECT 'constraint', c.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('products','orders','order_items','order_events','profiles','customers','customer_addresses')
UNION ALL
-- 3: function existence and signatures; do not execute functions
SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_function_result(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('create_pending_order','release_order_inventory')
ORDER BY kind,object_name,detail;
