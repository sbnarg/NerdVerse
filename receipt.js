(async()=>{
 const status=document.getElementById('receiptStatus'),paper=document.getElementById('receipt'),print=document.getElementById('printReceipt');
 const orderId=new URLSearchParams(location.search).get('order');
 const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 try{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId||''))throw Error('Open a receipt from My orders.');
  const user=await window.NV_AUTH?.user();if(!user)throw Error('Sign in to your account, then open the receipt from My orders.');
  const {data:o,error}=await NV_AUTH.client.from('orders').select('id,order_number,customer_id,customer_name,customer_email,shipping_address,subtotal,shipping_amount,discount_amount,total,currency,payment_status,payment_method,created_at,order_items(product_name,quantity,unit_price,total_price)').eq('id',orderId).eq('customer_id',user.id).maybeSingle();
  if(error||!o||o.customer_id!==user.id)throw Error('This receipt is unavailable for your account.');
  if(!['paid','refunded','partially_refunded'].includes(o.payment_status))throw Error('A receipt becomes available after payment is confirmed.');
  if(o.currency!=='INR'||!Number.isFinite(Number(o.total)))throw Error('Please contact order support for this receipt.');
  const {data:invoice,error:invoiceError}=await NV_AUTH.client.from('nv_tax_invoices').select('invoice_number,issued_at,data,customer_id').eq('order_id',orderId).eq('customer_id',user.id).maybeSingle();
  if(invoiceError)throw Error('Unable to load your invoice. Please try again shortly.');
  if(invoice&&invoice.customer_id!==user.id)throw Error('This invoice is unavailable for your account.');
  if(invoice){
   const d=invoice.data,amount=p=>money(Number(p||0)/100);
   paper.querySelector('h1').textContent='GST tax invoice';
   document.getElementById('receiptNumber').textContent='Invoice: '+invoice.invoice_number+' · Order: '+o.order_number;
   document.getElementById('receiptDate').textContent='Invoice date: '+new Date(invoice.issued_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
   paper.querySelector('.addresses p').textContent=[d.seller.trade_name,d.seller.legal_name+' · Proprietor',d.seller.address,'GSTIN: '+d.seller.gstin,d.seller.email].join('\n');
   document.getElementById('receiptCustomer').textContent=[d.buyer.name,d.buyer.email].filter(Boolean).join(' · ');
   const a=d.buyer.address||{};document.getElementById('receiptAddress').textContent=typeof a==='string'?a:[a.address||a.line1,a.line2,a.city,a.state,a.pin||a.postal_code||a.pincode,'Place of supply: '+d.place_of_supply].filter(Boolean).join(', ');
   const head=paper.querySelector('thead tr');head.replaceChildren();for(const label of ['Item / HSN','Qty','GST rate','Taxable','CGST','SGST','IGST','Total']){const th=document.createElement('th');th.textContent=label;head.append(th)}
   for(const l of d.lines){const row=document.createElement('tr');for(const value of [l.description+' · HSN '+l.hsn,String(l.quantity),l.gst_rate+'%',amount(l.taxable_paise),amount(l.cgst_paise),amount(l.sgst_paise),amount(l.igst_paise),amount(l.gross_paise)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}document.getElementById('receiptItems').append(row)}
   const totals=document.getElementById('receiptTotals');for(const [label,value] of [['Taxable value',d.taxable_paise],['CGST',d.cgst_paise],['SGST',d.sgst_paise],['IGST',d.igst_paise],['Rounding',d.rounding_paise],['Total paid',d.total_paise]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=amount(value);if(label==='Total paid')dt.className=dd.className='grand';totals.append(dt,dd)}
   document.getElementById('receiptPayment').textContent='Payment: '+o.payment_status.replaceAll('_',' ')+' · '+(o.payment_method||'Online payment');
   paper.querySelector('.note').textContent='Prices include GST. Reverse charge: No. This document is a copy of your single issued tax invoice; printing or downloading it does not issue another invoice.';
   document.title='Invoice '+invoice.invoice_number+' | NerdVerse India';paper.hidden=false;print.hidden=false;status.hidden=true;print.onclick=()=>window.print();return;
  }
  document.getElementById('receiptNumber').textContent='Order reference: '+o.order_number;
  document.getElementById('receiptDate').textContent='Order date: '+new Date(o.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
  document.getElementById('receiptCustomer').textContent=[o.customer_name,o.customer_email].filter(Boolean).join(' · ');
  const a=o.shipping_address||{};
  document.getElementById('receiptAddress').textContent=typeof a==='string'?a:[a.address||a.line1,a.line2,a.city,a.state,a.pin||a.postal_code||a.pincode,a.country].filter(Boolean).join(', ');
  const items=document.getElementById('receiptItems');
  for(const i of o.order_items||[]){const row=document.createElement('tr');for(const value of [i.product_name,String(i.quantity),money(i.unit_price),money(i.total_price??Number(i.unit_price)*Number(i.quantity))]){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}items.append(row)}
  const totals=document.getElementById('receiptTotals');for(const [label,value] of [['Items',o.subtotal],['Shipping',o.shipping_amount],...(Number(o.discount_amount)>0?[['Discount',-Number(o.discount_amount)]]:[]),['Total paid',o.total]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=money(value);if(label==='Total paid'){dt.className=dd.className='grand'}totals.append(dt,dd)}
  document.getElementById('receiptPayment').textContent='Payment: '+o.payment_status.replaceAll('_',' ')+' · '+(o.payment_method||'Online payment');
  document.title='Receipt '+o.order_number+' | NerdVerse India';
  paper.hidden=false;print.hidden=false;status.hidden=true;print.onclick=()=>window.print();
 }catch(e){status.textContent=e instanceof Error?e.message:'Unable to load this receipt. Please try again.';}
})();
