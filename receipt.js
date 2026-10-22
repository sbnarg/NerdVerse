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
