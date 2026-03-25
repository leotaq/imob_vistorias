-- Migration: Tabela de horários de trabalho por vistoriador
-- Execute no painel do Supabase: Database > SQL Editor

create table if not exists work_schedules (
  person_id        uuid primary key references people(id) on delete cascade,
  work_start       smallint not null default 8,
  work_start_min   smallint not null default 0,
  lunch_start      smallint not null default 12,
  lunch_start_min  smallint not null default 0,
  lunch_end        smallint not null default 13,
  lunch_end_min    smallint not null default 0,
  work_end         smallint not null default 18,
  work_end_min     smallint not null default 0,
  updated_at       timestamptz not null default now()
);

-- Habilitar RLS (acesso somente via service_role key, igual ao restante)
alter table work_schedules enable row level security;

create policy "service role full access" on work_schedules
  using (true)
  with check (true);
