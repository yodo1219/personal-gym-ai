-- receipts テーブル（レシート仕訳の記帳データ）
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  debit_account text not null,
  debit_amount numeric not null default 0,
  credit_account text not null,
  credit_amount numeric not null default 0,
  date date,
  description text,
  store_name text,
  tax_category text,
  tax_rate text,
  sub_account text default '',
  created_at timestamptz not null default now()
);

create index if not exists receipts_client_id_idx on receipts (client_id);
create index if not exists receipts_date_idx on receipts (date);

-- receipts テーブル（レシート仕訳の記帳データ）
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  debit_account text not null,
  debit_amount numeric not null default 0,
  credit_account text not null,
  credit_amount numeric not null default 0,
  date date,
  description text,
  store_name text,
  tax_category text,
  tax_rate text,
  sub_account text default '',
  created_at timestamptz not null default now()
);

create index if not exists receipts_client_id_idx on receipts (client_id);
create index if not exists receipts_date_idx on receipts (date);

-- receipt_line_images テーブル（LINEで受信したレシート画像の一時保管）
create table if not exists receipt_line_images (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  message_id text not null,
  status text not null default 'pending', -- pending / done
  created_at timestamptz not null default now()
);

create index if not exists receipt_line_images_user_status_idx
  on receipt_line_images (line_user_id, status);