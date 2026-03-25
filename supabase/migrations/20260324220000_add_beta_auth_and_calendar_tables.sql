alter table if exists people
  add column if not exists phone text null;

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
