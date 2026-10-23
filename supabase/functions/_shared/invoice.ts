// Reuse the immutable, unique-per-order invoice. Never calculate tax from browser input.
const states:Record<string,string>={'jammu and kashmir':'01','himachal pradesh':'02','punjab':'03','chandigarh':'04','uttarakhand':'05','haryana':'06','delhi':'07','rajasthan':'08','uttar pradesh':'09','bihar':'10','sikkim':'11','arunachal pradesh':'12','nagaland':'13','manipur':'14','mizoram':'15','tripura':'16','meghalaya':'17','assam':'18','west bengal':'19','jharkhand':'20','odisha':'21','chhattisgarh':'22','madhya pradesh':'23','gujarat':'24','dadra and nagar haveli and daman and diu':'26','maharashtra':'27','karnataka':'29','goa':'30','lakshadweep':'31','kerala':'32','tamil nadu':'33','puducherry':'34','andaman and nicobar islands':'35','telangana':'36','andhra pradesh':'37','ladakh':'38'};
export async function ensureInvoice(db:any,session:any){
 if(!session?.order_id||session.environment!=='production'||session.state!=='COMPLETED')return null;
 const existing=await db.from('nv_tax_invoices').select('*').eq('order_id',session.order_id).maybeSingle();
 if(existing.error)throw Error('invoice_read_failed');
 if(existing.data)return existing.data;
 const state=String(session.shipping_details?.state||'').toLowerCase().trim();
 const stateCode=session.customer?.state_code||states[state];
 if(!stateCode)return null;
 const issued=await db.rpc('nv_issue_tax_invoice',{p_order:session.order_id,p_state_code:stateCode});
 // Unconfigured HSN/rates and special cases need merchant review; payment remains confirmed.
 if(issued.error)return null;
 return issued.data;
}
export function invoiceEmailHtml(invoice:any){
 const d=invoice?.data;if(!d)return '';
 const escape=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const money=(p:any)=>'₹'+(Number(p||0)/100).toFixed(2);
 return `<h2>GST tax invoice ${escape(d.invoice_number)}</h2><p>${escape(d.seller.trade_name)} · ${escape(d.seller.legal_name)}<br>${escape(d.seller.address)}<br>GSTIN: ${escape(d.seller.gstin)}</p><p>Invoice date: ${escape(new Date(d.issued_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}))}<br>Place of supply: ${escape(d.place_of_supply)} · Reverse charge: No</p><table style="width:100%;border-collapse:collapse"><tr><th align="left">Item / HSN</th><th>Qty</th><th>GST</th><th>Taxable</th><th>Total</th></tr>${d.lines.map((l:any)=>`<tr><td>${escape(l.description)}<br>HSN ${escape(l.hsn)}</td><td>${Number(l.quantity)}</td><td>${Number(l.gst_rate)}%</td><td>${money(l.taxable_paise)}</td><td>${money(l.gross_paise)}</td></tr>`).join('')}</table><p>Taxable value: ${money(d.taxable_paise)}<br>CGST: ${money(d.cgst_paise)} · SGST: ${money(d.sgst_paise)} · IGST: ${money(d.igst_paise)}<br>Rounding: ${money(d.rounding_paise)}<br><strong>Total paid: ${money(d.total_paise)}</strong></p><p>Prices include GST. This is the same invoice available in My orders; printing it does not create a new invoice.</p>`;
}
