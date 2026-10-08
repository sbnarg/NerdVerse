(function(){
  const ready=()=>window.supabase&&window.NV_CONFIG&&!window.NV_CONFIG.supabaseUrl.includes('YOUR_PROJECT_REF');
  let client=null;if(ready())client=window.supabase.createClient(window.NV_CONFIG.supabaseUrl,window.NV_CONFIG.supabasePublishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  window.NV_AUTH={client,configured:!!client,
    async user(){if(!client)return null;const {data}=await client.auth.getUser();return data.user||null;},
    async session(){if(!client)return null;const {data}=await client.auth.getSession();return data.session||null;},
    async google(redirectPage='account.html'){if(!client)return alert('Add Supabase credentials in config.js.');const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.NV_CONFIG.siteUrl+redirectPage}});if(error)alert(error.message);},
    async magicLink(email){if(!client)return {error:new Error('Supabase is not configured')};return client.auth.signInWithOtp({email,options:{emailRedirectTo:window.NV_CONFIG.siteUrl+'account.html'}});},
    async signOut(){if(client)await client.auth.signOut();location.href='index.html';},
    async profile(){const user=await this.user();if(!user)return null;const {data}=await client.from('profiles').select('id,full_name,phone,role').eq('id',user.id).maybeSingle();return data||{id:user.id,full_name:user.user_metadata?.full_name||user.email,role:'customer'};}
  };
})();