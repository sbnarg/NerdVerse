import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { createPhonePeService } from './phonepe-service.ts';
import { sendEmail } from './email.ts';
import { createShiprocketClient, createShippingService } from './shiprocket.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export const shippingClient = createShiprocketClient(key => Deno.env.get(key));
export const shipping = createShippingService(db, shippingClient);
export const phonepe = createPhonePeService({ db, sendEmail, shipping,
  async authenticate(req) {
    const bearer = req.headers.get('Authorization');
    if (!bearer?.startsWith('Bearer ')) return null;
    const { data, error } = await db.auth.getUser(bearer.slice(7));
    return error ? null : data.user;
  },
  background(task) { EdgeRuntime.waitUntil(task); },
});

