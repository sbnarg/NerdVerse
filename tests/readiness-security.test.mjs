import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const policies=JSON.parse(await readFile(new URL('./rls-policy-fixture.json',import.meta.url),'utf8'));
const migration=await readFile(new URL('../supabase/migrations/20261022154831_readiness_security_performance_hardening.sql',import.meta.url),'utf8');
test('hardening preserves anonymous, customer and admin visibility while hiding seller costs',async()=>{
 const db=new PGlite();
 const own='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
 CREATE TABLE admin_users(id uuid,role text); INSERT INTO admin_users VALUES('${admin}','admin');
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE id=auth.uid()) $$;
 CREATE FUNCTION handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN new; END $$;
 CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN new.updated_at=now(); RETURN new; END $$;`);
 const tables=[...new Set(policies.map(p=>p.tablename))];
 for(const table of [...tables,'nv_phonepe_sessions']) await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY, customer_id uuid,product_id uuid,order_id uuid,cart_id uuid,status text,is_active boolean,is_approved boolean,name text,cost_price numeric,updated_at timestamptz);
 GRANT ALL ON ${table} TO anon,authenticated,service_role; ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
 INSERT INTO ${table}(id,customer_id,product_id,order_id,cart_id,status,is_active,is_approved,name,cost_price) VALUES('${own}','${own}','${own}','${own}','${own}','active',true,true,'visible',70),('${other}','${other}','${other}','${other}','${other}','draft',false,false,'private',90);`);
 for(const p of policies) await db.exec(`CREATE POLICY "${p.policyname}" ON ${p.tablename} FOR ${p.cmd} TO ${p.roles.join(',')} ${p.qual?'USING ('+p.qual+')':''} ${p.with_check?'WITH CHECK ('+p.with_check+')':''}`);
 async function views(){const all={};for(const [role,id] of [['anon',''],['authenticated',own],['authenticated',other],['authenticated',admin]]){
  await db.exec(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${id}',true);`);
  try {for(const table of tables) all[role+id+table]=(await db.query(`SELECT id FROM ${table} ORDER BY id`)).rows;} finally{await db.exec('ROLLBACK');}
 }return all;}
 const before=await views(); await db.exec(migration); assert.deepEqual(await views(),before);
 assert.equal((await db.query("SELECT to_regprocedure('public.is_admin()') IS NULL AS removed")).rows[0].removed,true);
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.handle_new_user()','EXECUTE') AS allowed")).rows[0].allowed,false);
 await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${own}',true);`);
 assert.equal((await db.query('SELECT name FROM products')).rows.length,1);
 await assert.rejects(db.query('SELECT cost_price FROM products'),/permission denied/); await db.exec('ROLLBACK');
 await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${own}',true);`);
 assert.equal((await db.query(`UPDATE customers SET name='own' WHERE id='${other}' RETURNING id`)).rows.length,0);
 await assert.rejects(db.query(`UPDATE customers SET id='${admin}' WHERE id='${own}'`),/row-level security/); await db.exec('ROLLBACK');
 }finally{await db.close();}
});
