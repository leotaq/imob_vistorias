create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_code_normalized_unique unique (code_normalized)
);

drop trigger if exists trg_properties_updated_at on properties;
create trigger trg_properties_updated_at
before update on properties
for each row
execute function set_updated_at();

create unique index if not exists properties_code_normalized_idx
  on properties (code_normalized);
