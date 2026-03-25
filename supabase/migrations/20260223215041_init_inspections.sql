-- MVP: Vistorias (sem login)
-- Execute este arquivo no SQL Editor do Supabase (uma unica vez, em um banco vazio).

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

do $$ begin
  create type inspection_type as enum ('ocupacao', 'desocupacao', 'revistoria', 'visita', 'placa_fotos');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type inspection_status as enum ('new', 'received', 'in_progress', 'completed', 'finalized', 'canceled');
exception
  when duplicate_object then null;
end $$;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint people_role_check check (role in ('manager', 'inspector', 'attendant'))
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
  contract_date date null,
  notes text null,
  scheduled_start timestamptz null,
  duration_minutes int null,
  scheduled_end timestamptz null,
  received_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),

  constraint inspections_created_by_fkey foreign key (created_by) references people(id),
  constraint inspections_assigned_to_fkey foreign key (assigned_to) references people(id),

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

create index if not exists inspections_assigned_to_scheduled_start_idx
  on inspections (assigned_to, scheduled_start);
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

