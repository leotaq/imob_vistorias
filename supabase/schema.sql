-- MVP: Vistorias (sem login)
-- Execute este arquivo no SQL Editor do Supabase (uma unica vez, em um banco vazio).

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

do $$ begin
  create type inspection_type as enum ('ocupacao', 'desocupacao', 'revistoria', 'visita', 'placa_fotos');
exception
  when duplicate_object then null;
end $$;

create table if not exists auth_access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text null,
  avatar_url text null,
  provider text not null default 'google',
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references people(id),
  notes text null,
  constraint auth_access_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'revoked'))
);

create unique index if not exists auth_access_requests_auth_user_id_unique
  on auth_access_requests (auth_user_id);
create index if not exists auth_access_requests_status_requested_idx
  on auth_access_requests (status, requested_at desc);

create table if not exists person_auth_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  provider text not null default 'google',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references people(id),
  revoked_at timestamptz null,
  revoked_by uuid null references people(id)
);

create unique index if not exists person_auth_links_person_active_unique
  on person_auth_links (person_id)
  where active = true;
create unique index if not exists person_auth_links_auth_user_active_unique
  on person_auth_links (auth_user_id)
  where active = true;
create index if not exists person_auth_links_active_person_idx
  on person_auth_links (active, person_id);

create table if not exists person_google_calendar_links (
  person_id uuid primary key references people(id) on delete cascade,
  google_email text not null,
  calendar_id text not null,
  calendar_summary text null,
  refresh_token_encrypted text not null,
  access_token_encrypted text null,
  token_expires_at timestamptz null,
  scope text null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz null,
  last_sync_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_google_calendar_links_sync_enabled_idx
  on person_google_calendar_links (sync_enabled);

create table if not exists inspection_google_calendar_events (
  inspection_id uuid primary key references inspections(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  calendar_id text not null,
  google_event_id text not null,
  event_etag text null,
  sync_state text not null default 'synced',
  last_synced_at timestamptz not null default now(),
  last_sync_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_google_calendar_events_sync_state_check
    check (sync_state in ('synced', 'error', 'deleted'))
);

create unique index if not exists inspection_google_calendar_events_external_unique
  on inspection_google_calendar_events (calendar_id, google_event_id);
create index if not exists inspection_google_calendar_events_person_sync_idx
  on inspection_google_calendar_events (person_id, last_synced_at desc);

create table if not exists google_oauth_states (
  state text primary key,
  person_id uuid not null references people(id) on delete cascade,
  purpose text not null default 'calendar_connect',
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists google_oauth_states_person_expires_idx
  on google_oauth_states (person_id, expires_at);

drop trigger if exists trg_person_google_calendar_links_updated_at on person_google_calendar_links;
create trigger trg_person_google_calendar_links_updated_at
before update on person_google_calendar_links
for each row
execute function set_updated_at();

drop trigger if exists trg_inspection_google_calendar_events_updated_at on inspection_google_calendar_events;
create trigger trg_inspection_google_calendar_events_updated_at
before update on inspection_google_calendar_events
for each row
execute function set_updated_at();

do $$ begin
  create type inspection_status as enum ('new', 'received', 'in_progress', 'completed', 'finalized', 'canceled');
exception
  when duplicate_object then null;
end $$;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint people_role_check check (role in ('manager', 'inspector', 'attendant', 'marketing')),
  constraint people_phone_check check (phone is null or phone ~ '^[+]?[0-9]{10,15}$')
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text not null,
  address text not null,
  property_street text null,
  property_number text null,
  property_complement text null,
  property_neighborhood text null,
  property_city text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_code_normalized_unique unique (code_normalized),
  constraint properties_property_city_check check (
    property_city is null
    or property_city in ('Taquara', 'Parobé', 'Igrejinha')
  )
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  assigned_to uuid not null,
  type inspection_type not null,
  status inspection_status not null default 'new',
  property_code text not null,
  property_address text not null,
  property_street text null,
  property_number text null,
  property_complement text null,
  property_neighborhood text null,
  property_city text null,
  contract_date timestamptz null,
  notes text null,
  scheduled_start timestamptz null,
  duration_minutes int null,
  scheduled_end timestamptz null,
  received_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),

  assigned_to_marketing uuid null,

  constraint inspections_created_by_fkey foreign key (created_by) references people(id),
  constraint inspections_assigned_to_fkey foreign key (assigned_to) references people(id),
  constraint inspections_assigned_to_marketing_fkey foreign key (assigned_to_marketing) references people(id),
  constraint inspections_property_city_check check (
    property_city is null
    or property_city in ('Taquara', 'Parobé', 'Igrejinha')
  ),

  constraint inspections_schedule_valid check (
    (
      scheduled_start is null
      and scheduled_end is null
      and duration_minutes is null
    ) or (
      scheduled_start is not null
      and scheduled_end is not null
      and duration_minutes is not null
      and duration_minutes > 0
      and scheduled_end > scheduled_start
    )
  )
);

create table if not exists inspection_status_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  from_status inspection_status null,
  to_status inspection_status not null,
  changed_at timestamptz not null default now(),
  changed_by uuid null references people(id)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inspections_updated_at on inspections;
create trigger trg_inspections_updated_at
before update on inspections
for each row
execute function set_updated_at();

drop trigger if exists trg_properties_updated_at on properties;
create trigger trg_properties_updated_at
before update on properties
for each row
execute function set_updated_at();

create unique index if not exists properties_code_normalized_idx
  on properties (code_normalized);
create index if not exists inspections_assigned_to_scheduled_start_idx
  on inspections (assigned_to, scheduled_start);
create index if not exists inspections_assigned_to_marketing_idx
  on inspections (assigned_to_marketing);
create index if not exists inspections_status_idx on inspections (status);
create index if not exists inspections_created_at_idx on inspections (created_at);
create index if not exists inspections_metrics_idx
  on inspections (created_at, type, status, property_city, created_by, assigned_to);
create index if not exists inspection_status_events_metrics_idx
  on inspection_status_events (changed_at, to_status, inspection_id);

-- Bloqueio de conflitos de horario por vistoriador.
-- Impede sobreposicao de [scheduled_start, scheduled_end) para o mesmo assigned_to,
-- ignorando vistorias canceladas.
do $$ begin
  alter table inspections
    add constraint inspections_no_overlap_per_inspector
    exclude using gist (
      assigned_to with =,
      tstzrange(scheduled_start, scheduled_end, '[)') with &&
    )
    where (
      status <> 'canceled'
      and scheduled_start is not null
      and scheduled_end is not null
    );
exception
  when duplicate_object then null;
end $$;
