const CATALOG = [
  {
    id:'hw-lm002', name:'Hot Wheels Premium — Lamborghini LM002', brand:'Mattel', category:'Die-Cast', subcategory:'Hot Wheels Premium', series:'Fast & Furious Premium', seriesNo:'2/5', condition:'Card Mint', price:1199, status:'available', badge:'FAST & FURIOUS', image:'lamborghini-lm002.jpg',
    description:'The rugged Lamborghini LM002 from the Fast & Furious Premium line, finished as a collector-grade 1:64 die-cast with Real Riders.', tags:['Hot Wheels','Fast & Furious','Lamborghini','Premium','Real Riders'], details:['Manufacturer: Mattel','Series: Fast & Furious Premium','Card condition: Mint','Metal/Metal body','Real Riders']
  },
  {
    id:'hw-240sx', name:'Hot Wheels Premium — Nissan 240SX (S14)', brand:'Mattel', category:'Die-Cast', subcategory:'Hot Wheels Premium', series:'Fast & Furious Premium', seriesNo:'1/5', condition:'Card Mint', price:1199, status:'available', badge:'JDM ICON', image:'nissan-240sx.jpg',
    description:'An iconic JDM legend from the Fast & Furious Premium series. A sharp collector piece for Hot Wheels and movie-car fans.', tags:['Hot Wheels','Fast & Furious','Nissan','JDM','Premium'], details:['Manufacturer: Mattel','Series: Fast & Furious Premium','Card condition: Mint','Metal/Metal body','Real Riders']
  },
  {
    id:'hw-roadrunner', name:'Hot Wheels Premium — 1970 Custom Plymouth Roadrunner', brand:'Mattel', category:'Die-Cast', subcategory:'Hot Wheels Premium', series:'Fast & Furious Premium', seriesNo:'4/5', condition:'Card Mint', price:1199, status:'available', badge:'MUSCLE', image:'plymouth-roadrunner.jpg',
    description:'A classic 1970 Custom Plymouth Roadrunner from the Fast & Furious Premium series, built for serious die-cast collectors.', tags:['Hot Wheels','Fast & Furious','Plymouth','Muscle Car','Premium'], details:['Manufacturer: Mattel','Series: Fast & Furious Premium','Card condition: Mint','Metal/Metal body','Real Riders']
  },
  {
    id:'fs-targat', name:'Funskool G.I. Joe — T.A.R.G.A.T.', brand:'Funskool', category:'Action Figures', subcategory:'Vintage G.I. Joe', series:'International Heroes', condition:'Fair — see images', price:9999, status:'available', badge:'VINTAGE', image:'targat.jpg',
    description:'T.A.R.G.A.T. — Cobra Trans-Atmospheric Rapid Global Assault Trooper from Funskool’s International Heroes line. MOC and never opened.', tags:['G.I. Joe','Funskool','Vintage','MOC','International Heroes'], details:['Country of origin: India','Type: MOC — Never Opened','Condition: Fair — see images','DIT/LIT not covered','Shipping extra at actuals']
  },
  {
    id:'fs-budo', name:'Funskool G.I. Joe — Budo Samurai Warrior', brand:'Funskool', category:'Action Figures', subcategory:'Vintage G.I. Joe', series:'International Heroes', condition:'OK — see images', price:8999, status:'available', badge:'VINTAGE', image:'budo.jpg',
    description:'Budo, the Samurai Warrior, from Funskool’s G.I. Joe International Heroes line. MOC and never opened.', tags:['G.I. Joe','Funskool','Budo','Vintage','MOC'], details:['Country of origin: India','Type: MOC — Never Opened','Condition: OK — see images','DIT/LIT not covered','Shipping extra at actuals']
  },
  {
    id:'fs-incinerator', name:'Funskool G.I. Joe — Incinerator', brand:'Funskool', category:'Action Figures', subcategory:'Vintage G.I. Joe', series:'International Heroes', condition:'Figure excellent; yellow blister', price:10999, status:'available', badge:'RARE', image:'incinerator.jpg',
    description:'Incinerator, the Cobra Flamethrower Specialist. A striking vintage Funskool G.I. Joe MOC example with a yellowed blister.', tags:['G.I. Joe','Funskool','Incinerator','Vintage','MOC'], details:['Country of origin: India','Type: MOC — Never Opened','Figure condition: Excellent','Blister: Yellowed','No returns; DIT/LIT not covered']
  },
  {
    id:'fs-scrap-iron', name:'Funskool G.I. Joe — Scrap Iron', brand:'Funskool', category:'Action Figures', subcategory:'Vintage G.I. Joe', series:'International Heroes', condition:'Blister cracked and yellow', price:null, status:'available', badge:'PRICE ON REQUEST', image:'scrap-iron.jpg',
    description:'Scrap Iron, a Cobra anti-tank specialist from the Funskool G.I. Joe International Heroes line. MOC with cracked and yellowed blister.', tags:['G.I. Joe','Funskool','Scrap Iron','Vintage','MOC'], details:['Country of origin: India','Type: MOC — Never Opened','Blister: Cracked and yellow','Price: On request','DIT/LIT not specified']
  },
  {
    id:'fs-tripwire', name:'Funskool G.I. Joe — Tripwire', brand:'Funskool', category:'Action Figures', subcategory:'Vintage G.I. Joe', series:'International Heroes', condition:'Fair — see images', price:8999, status:'sold', badge:'SOLD OUT', image:'tripwire.jpg',
    description:'Tripwire, a Bomb Squad specialist from the Funskool G.I. Joe International Heroes line. This listing has been sold.', tags:['G.I. Joe','Funskool','Tripwire','Vintage','Sold Out'], details:['Country of origin: India','Type: MOC — Never Opened','Condition: Fair — see images','Status: Sold out','DIT/LIT not covered']
  }
];

function money(n){ return n==null ? 'Price on request' : '₹'+Number(n).toLocaleString('en-IN'); }
function getProduct(id){ return CATALOG.find(p=>p.id===id); }

let ACTIVE_CATALOG = CATALOG.map(p=>({...p,stock_qty:p.status==='sold'?0:1}));
async function hydrateCatalog(){
 try{
  if(!window.supabase||!window.NV_CONFIG)return;
  const client=window.supabase.createClient(window.NV_CONFIG.supabaseUrl,window.NV_CONFIG.supabasePublishableKey);
  const {data,error}=await client.from('products').select('id,name,brand,price,stock,status,description,condition,category_id,image_urls').eq('status','published').order('name');
  if(error){console.warn('NerdVerse catalogue sync failed',error.message);ACTIVE_CATALOG=[];return}
  const {data:categories}=await client.from('categories').select('id,name');
  const byId=Object.fromEntries((categories||[]).map(c=>[c.id,c.name]));
  ACTIVE_CATALOG=(data||[]).map(p=>{
   const legacy=CATALOG.find(c=>c.name===p.name);
   return {...p,category:byId[p.category_id]||legacy?.category||'Other Collectibles',image:p.image_urls?.[0]||legacy?.image||'',stock_qty:p.stock,badge:legacy?.badge||'COLLECTIBLE',tags:legacy?.tags||[],details:legacy?.details||[],series:legacy?.series||'',subcategory:legacy?.subcategory||'',condition:p.condition||legacy?.condition||'',status:p.stock>0&&Number(p.price)>0?'available':'sold'};
  });
 }catch(e){console.warn('Catalogue sync failed',e);ACTIVE_CATALOG=[]}
}
