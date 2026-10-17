import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite} = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const uid='11111111-1111-4111-8111-111111111111';
const pid='22222222-2222-4222-8222-222222222222';
const customer={name:'Sandbox Customer',email:'test@example.invalid',phone:'9000000000',address:'Fixture address only',city:'Bengaluru',pin:'560068'};
const items=[{product_id:pid,quantity:1}];
const migration=await readFile(new URL('../supabase/migrations/20261017141209_phonepe_checkout.sql',import.meta.url),'utf8');
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA vault;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE vault.decrypted_secrets(id uuid PRIMARY KEY,decrypted_secret text);
 CREATE TABLE public.admin_users(id uuid PRIMARY KEY,role text);
 CREATE TABLE public.customers(id uuid PRIMARY KEY REFERENCES auth.users(id),name text,email text,phone text);
 CREATE TABLE public.products(id uuid PRIMARY KEY,name text NOT NULL,sku text,price numeric NOT NULL,stock int NOT NULL,status text CHECK(status IN ('active','draft','sold_out','archived')),updated_at timestamptz);
 CREATE TABLE public.orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_number text UNIQUE NOT NULL,customer_id uuid REFERENCES customers(id),customer_name text NOT NULL,customer_email text,customer_phone text,shipping_address jsonb NOT NULL,subtotal numeric NOT NULL DEFAULT 0,shipping_amount numeric NOT NULL DEFAULT 0,total numeric NOT NULL DEFAULT 0,payment_method text,status text DEFAULT 'pending' CHECK(status IN ('pending','confirmed','processing','packed','shipped','delivered','cancelled','refunded')),payment_status text DEFAULT 'pending' CHECK(payment_status IN ('pending','authorized','paid','failed','refunded','partially_refunded')),updated_at timestamptz);
 CREATE TABLE public.order_items(order_id uuid REFERENCES orders(id),product_id uuid REFERENCES products(id),product_name text,product_sku text,quantity int CHECK(quantity>0),unit_price numeric,total_price numeric);
 GRANT USAGE ON SCHEMA public,vault,auth TO service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 GRANT SELECT ON vault.decrypted_secrets TO service_role;
 INSERT INTO auth.users VALUES('${uid}'); INSERT INTO admin_users VALUES('${uid}','admin');
 INSERT INTO products VALUES('${pid}','Fixture collectible','fixture',4999,2,'active',now());`);
 await db.exec(migration);
 await db.exec("UPDATE nv_phonepe_config SET enabled=true,credentials_secret_id=gen_random_uuid();");
});
after(()=>db.close());
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
async function reserve(env='sandbox',key=crypto.randomUUID(),cart=items,c=customer){return (await one('SELECT nv_phonepe_reserve($1,$2,$3,$4,$5) s',[uid,env,key,JSON.stringify(cart),JSON.stringify(c)])).s;}
async function status(s,state='COMPLETED',amount=499900,id='OMO-TEST'){return (await one('SELECT nv_phonepe_apply_status($1,$2,$3,$4) s',[s.id,id,state,amount])).s;}
async function isolated(fn){await db.exec('BEGIN');try{await fn();}finally{await db.exec('ROLLBACK');}}
test('sandbox completion creates no real orders, email or stock change',()=>isolated(async()=>{
 await db.exec('SET LOCAL ROLE service_role');
 const s=await reserve(); assert.equal(s.order_id,null);assert.equal(s.reserved,false);
 await status(s); await status(s);
 assert.equal((await one('SELECT count(*)::int n FROM orders')).n,0);
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,2);
 assert.equal((await one('SELECT count(*)::int n FROM nv_phonepe_email_queue')).n,0);
 assert.equal((await one('SELECT count(*)::int n FROM nv_phonepe_events')).n,1);
}));
test('same request key is idempotent and rejects changed checkout',()=>isolated(async()=>{
 const key=crypto.randomUUID(),a=await reserve('production',key),b=await reserve('production',key);
 assert.equal(a.id,b.id); assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,1);
 await assert.rejects(reserve('production',key,[{product_id:pid,quantity:2}]),/changed/);
}));
test('failed production payment restores stock exactly once and cannot later become paid',()=>isolated(async()=>{
 const s=await reserve('production');
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,1);
 await status(s,'FAILED');await status(s,'FAILED');
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,2);
 const o=await one('SELECT status,payment_status FROM orders WHERE id=$1',[s.order_id]);
 assert.deepEqual(o,{status:'cancelled',payment_status:'failed'});
 await assert.rejects(status(s,'COMPLETED'),/Conflicting/);
}));
test('paid production order and notification are idempotent, never released by later failure',()=>isolated(async()=>{
 const s=await reserve('production'); await status(s);await status(s);
 assert.equal((await one('SELECT count(*)::int n FROM nv_phonepe_email_queue')).n,1);
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,1);
 assert.deepEqual(await one('SELECT status,payment_status FROM orders WHERE id=$1',[s.order_id]),{status:'confirmed',payment_status:'paid'});
 await assert.rejects(status(s,'FAILED'),/Conflicting/);
}));
test('mismatched amount or provider ID cannot mark an order paid',()=>isolated(async()=>{
 const s=await reserve('production');
 await assert.rejects(status(s,'COMPLETED',100),/mismatch/);
}));
test('duplicate products, sold out stock and missing shipping quotes fail closed',()=>isolated(async()=>{
 await assert.rejects(reserve('sandbox',crypto.randomUUID(),[...items,...items]),/Duplicate/);
}));
test('free shipping only above 2999 and most specific configured PIN prefix wins',()=>isolated(async()=>{
 await db.exec('UPDATE products SET price=2999');
 await assert.rejects(db.query('SELECT nv_phonepe_quote($1,$2)',[JSON.stringify(items),'560068']),/Shipping quote/);
}));
test('shipping prefix lookup and stock validation',()=>isolated(async()=>{
 await db.exec("UPDATE products SET price=2999; INSERT INTO nv_shipping_rates VALUES('56',100,true),('560068',80,true);");
 const q=(await one('SELECT nv_phonepe_quote($1,$2) q',[JSON.stringify(items),'560068'])).q;
 assert.equal(q.total,3079);assert.equal(q.shipping,80);
 await db.exec('UPDATE products SET stock=0');
 await assert.rejects(reserve(),/insufficient stock/);
}));
test('authenticated clients cannot invoke privileged checkout RPCs',()=>isolated(async()=>{
 await db.exec('SET LOCAL ROLE authenticated');
 await assert.rejects(db.query("SELECT nv_phonepe_runtime('sandbox')"),/permission denied/);
}));
test('sandbox requires an administrator and production must be explicitly enabled',()=>isolated(async()=>{
 await db.exec("DELETE FROM admin_users;");
 await assert.rejects(reserve(),/administrators/);
}));
test('only sessions that provably never started may expire locally',()=>isolated(async()=>{
 const s=await reserve('production');
 await db.exec("UPDATE nv_phonepe_sessions SET created_at=now()-interval '11 minutes'");
 assert.equal((await one('SELECT nv_phonepe_cancel_unstarted($1) ok',[s.id])).ok,true);
 assert.equal((await one('SELECT nv_phonepe_cancel_unstarted($1) ok',[s.id])).ok,false);
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,2);
}));
test('a claimed provider request never releases stock merely because it is old',()=>isolated(async()=>{
 const s=await reserve('production');
 await db.exec("UPDATE nv_phonepe_sessions SET created_at=now()-interval '2 hours',initiation_claimed_at=now()-interval '2 hours'");
 assert.equal((await one('SELECT nv_phonepe_cancel_unstarted($1) ok',[s.id])).ok,false);
 assert.equal((await one('SELECT stock FROM products WHERE id=$1',[pid])).stock,1);
}));
test('provider attachment requires a claimed session and preserves terminal status',()=>isolated(async()=>{
 const s=await reserve();
 await db.exec('UPDATE nv_phonepe_sessions SET initiation_claimed_at=now()');
 const attached=(await one('SELECT nv_phonepe_attach($1,$2,$3) s',[s.id,'OMO-TEST','https://mercury-uat.phonepe.com/test'])).s;
 assert.equal(attached.provider_order_id,'OMO-TEST');
 await status(s);
 const terminal=(await one('SELECT nv_phonepe_attach($1,$2,$3) s',[s.id,'OMO-TEST','https://mercury-uat.phonepe.com/test'])).s;
 assert.equal(terminal.state,'COMPLETED');
}));
test('disabled production configuration blocks even service-role order creation',()=>isolated(async()=>{
 await db.exec("UPDATE nv_phonepe_config SET enabled=false WHERE environment='production'");
 await assert.rejects(reserve('production'),/not activated/);
}));
