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

let ACTIVE_CATALOG = [];
window.NV_CATALOG_ERROR = null;
async function hydrateCatalog(){
 window.NV_CATALOG_ERROR=null;
 try{
  const config=window.NV_CONFIG;
  if(!config?.supabaseUrl||!config?.supabasePublishableKey)throw new Error('Storefront database configuration is missing');
  const base=config.supabaseUrl.replace(/\\/$/,'')+'/rest/v1/';
  const headers={apikey:config.supabasePublishableKey,Accept:'application/json'};
  async function read(path){
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetch(base+path,{headers,signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('Inventory HTTP '+response.status+': '+(await response.text()).slice(0,180));
    return await response.json();
   }finally{clearTimeout(timeout)}
  }
  const data=await read('products?select=id,name,brand,price,stock,status,description,condition,category_id,image_urls&status=in.(active,sold_out)&order=name.asc');
  if(!Array.isArray(data)||!data.length)throw new Error('No public product records returned. Check storefront SELECT permissions.');
  let categories=[];
  try{categories=await read('categories?select=id,name')}catch(e){console.warn('Category names unavailable',e)}
  const byId=Object.fromEntries(categories.map(x=>[x.id,x.name]));
  ACTIVE_CATALOG=data.map(p=>{
   const legacy=CATALOG.find(x=>x.name===p.name||x.id===p.id);
   return {...p,category:byId[p.category_id]||legacy?.category||'Other Collectibles',image:p.image_urls?.[0]||legacy?.image||'',images:Array.isArray(p.image_urls)?p.image_urls:[],stock_qty:Number(p.stock)||0,badge:legacy?.badge||'COLLECTIBLE',tags:legacy?.tags||[],details:legacy?.details||[],series:legacy?.series||'',subcategory:legacy?.subcategory||'',condition:p.condition||legacy?.condition||'',status:p.status==='sold_out'||Number(p.stock)<=0?'sold':'available'};
  });
 }catch(e){
  console.error('NerdVerse public inventory failed',e);
  ACTIVE_CATALOG=[];
  window.NV_CATALOG_ERROR='Live inventory is temporarily unavailable. Please try again shortly.';
 }
}

// Segment detection uses product metadata, never guesses from uploaded photographs.
const NV_SEGMENTS=["Masters of the Universe","G.I. Joe","Hot Wheels","Mini GT","Tomica","Hasbro","Marvel","DC","Funskool","Mattel","Transformers","Star Wars","Matchbox","Majorette","LEGO","McFarlane"];
function nvNormalize(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function nvDetectSegment(p){const name=nvNormalize(p.name),brand=nvNormalize(p.brand),description=nvNormalize(p.description);const all=[name,brand,description].join(' ');const match=(re)=>re.test(all);if(match(/masters of the universe|\bmotu\b|he man|skeletor/))return 'Masters of the Universe';if(match(/g i joe|\bgijoe\b|\bcobra\b|international heroes/))return 'G.I. Joe';if(match(/hot wheels/))return 'Hot Wheels';if(match(/mini gt|mini gt64/))return 'Mini GT';if(match(/tomica/))return 'Tomica';if(match(/transformers|optimus prime|megatron/))return 'Transformers';if(match(/star wars|mandalorian/))return 'Star Wars';if(match(/matchbox/))return 'Matchbox';if(match(/majorette/))return 'Majorette';if(match(/mcfarlane/))return 'McFarlane';if(match(/\blego\b/))return 'LEGO';if(match(/\bmarvel\b|spider man|iron man|avengers/))return 'Marvel';if(match(/\bdc\b|batman|superman|justice league/))return 'DC';if(match(/\bfunskool\b/))return 'Funskool';if(match(/\bhasbro\b/))return 'Hasbro';if(match(/\bmattel\b/))return 'Mattel';return ''}
