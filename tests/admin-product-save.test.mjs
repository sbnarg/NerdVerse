import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {productImageUrls} from '../supabase/functions/_shared/product-images.ts';
let handler,updates=[];
const images=['https://nerdverseindia.com/products/studio-refresh/example/hero.svg'];
const db={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(table){
 let patch;
 const q={select(){return q},eq(){return q},update(row){patch=row;updates.push(row);return q},async maybeSingle(){return table==='admin_users'?{data:{role:'admin'}}:patch?{data:{id:'product'}}:{data:{image_urls:images}}}};
 return q;
}};
let source=readFileSync('supabase/functions/admin-api/index.ts','utf8').replace(/import [^;]+ from '[^']+';/g,'');
source=stripTypeScriptTypes(source);
const context={productImageUrls,createClient:()=>db,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://hzzuqylaypoylakgnqxs.supabase.co':'test'},serve:f=>handler=f},json:(b,status=200)=>new Response(JSON.stringify(b),{status}),corsHeaders:{},URL,Response,Set,Date,Number,Object,Error};
vm.runInNewContext(source,context);
const product={name:'T.A.R.G.A.T.',price:4999,stock:0,status:'active',condition:'vintage',image_urls:images};
async function call(p){return handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'update_product',product_id:'product',product:p})}))}
let r=await call(product);assert.equal(r.status,200,await r.text());assert.equal(updates.at(-1).stock,0);assert.deepEqual(updates.at(-1).image_urls,images);
const {image_urls,...noImages}=product;r=await call(noImages);assert.equal(r.status,200);assert.equal('image_urls' in updates.at(-1),false);
const count=updates.length;r=await call({...product,image_urls:['https://evil.example/new.svg']});assert.equal(r.status,400);assert.equal(updates.length,count);
console.log('Actual save handler: existing branded photo + zero stock succeeds; omitted photos preserved; external new photo rejected. Mocked database only.');
