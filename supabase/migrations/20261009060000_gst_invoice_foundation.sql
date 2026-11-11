-- Invoice foundation: metadata only. No tax invoice is issued until GST setup is approved.
create table if not exists public.seller_tax_settings (
  id boolean primary key default true check (id),
  legal_name text not null default 'Zineeya Roy Chowdhury',
  trade_name text not null default 'NerdVerse India',
  state_code char(2) not null default '29',
  gstin text,
  registered_address text,
  gst_enabled boolean not null default false,
  checkout_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint gst_ready_only_when_registered check (
    not gst_enabled or (gstin is not null and gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' and registered_address is not null and length(trim(registered_address)) > 10)
  ),
  constraint checkout_requires_gst check (not checkout_enabled or gst_enabled)
);
insert into public.seller_tax_settings(id) values(true) on conflict (id) do nothing;
alter table public.seller_tax_settings enable row level security;
-- No public policies: read/write through privileged backend only.

create table if not exists public.product_tax_classification (
  product_id text primary key references public.products(id) on delete cascade,
  hsn_code text not null check (hsn_code ~ '^[0-9]{4,8}$'),
  gst_rate numeric(5,2) not null check (gst_rate >= 0 and gst_rate <= 100),
  reviewed_at timestamptz,
  reviewed_by text
);
alter table public.product_tax_classification enable row level security;

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  financial_year text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  sequence_no bigint not null,
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  seller_name text not null,
  seller_gstin text not null,
  seller_address text not null,
  buyer_name text not null,
  buyer_address text not null,
  place_of_supply_state char(2) not null,
  taxable_amount numeric(12,2) not null check (taxable_amount >= 0),
  cgst_amount numeric(12,2) not null default 0 check(cgst_amount >= 0),
  sgst_amount numeric(12,2) not null default 0 check(sgst_amount >= 0),
  igst_amount numeric(12,2) not null default 0 check(igst_amount >= 0),
  total_amount numeric(12,2) not null check(total_amount >= 0),
  snapshot jsonb not null,
  pdf_storage_path text,
  created_at timestamptz not null default now(),
  unique(financial_year,sequence_no)
);
alter table public.sales_invoices enable row level security;
create policy sales_invoices_owner_read on public.sales_invoices for select
  using (exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid()));
-- Issuance must be implemented in a privileged, idempotent server-side transaction.
-- Do not expose invoice creation or tax-settings writes to the browser.
