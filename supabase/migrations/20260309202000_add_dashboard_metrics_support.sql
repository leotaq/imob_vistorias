alter table if exists properties
  add column if not exists property_street text,
  add column if not exists property_number text,
  add column if not exists property_complement text,
  add column if not exists property_neighborhood text,
  add column if not exists property_city text;

alter table if exists inspections
  add column if not exists property_street text,
  add column if not exists property_number text,
  add column if not exists property_complement text,
  add column if not exists property_neighborhood text,
  add column if not exists property_city text;

do $$ begin
  alter table properties
    add constraint properties_property_city_check
    check (
      property_city is null
      or property_city in ('Taquara', 'Parobé', 'Igrejinha')
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table inspections
    add constraint inspections_property_city_check
    check (
      property_city is null
      or property_city in ('Taquara', 'Parobé', 'Igrejinha')
    );
exception
  when duplicate_object then null;
end $$;

create table if not exists inspection_status_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  from_status inspection_status null,
  to_status inspection_status not null,
  changed_at timestamptz not null default now(),
  changed_by uuid null references people(id)
);

create index if not exists inspections_metrics_idx
  on inspections (created_at, type, status, property_city, created_by, assigned_to);

create index if not exists inspection_status_events_metrics_idx
  on inspection_status_events (changed_at, to_status, inspection_id);

update properties
set
  property_street = nullif(trim(coalesce(property_street, address)), ''),
  property_city = case
    when nullif(trim(property_city), '') is not null then trim(property_city)
    when position(
      'taquara' in lower(
        translate(
          coalesce(address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Taquara'
    when position(
      'parobe' in lower(
        translate(
          coalesce(address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Parobé'
    when position(
      'igrejinha' in lower(
        translate(
          coalesce(address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Igrejinha'
    else null
  end;

update inspections
set
  property_street = nullif(trim(coalesce(property_street, property_address)), ''),
  property_city = case
    when nullif(trim(property_city), '') is not null then trim(property_city)
    when position(
      'taquara' in lower(
        translate(
          coalesce(property_address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Taquara'
    when position(
      'parobe' in lower(
        translate(
          coalesce(property_address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Parobé'
    when position(
      'igrejinha' in lower(
        translate(
          coalesce(property_address, ''),
          'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      )
    ) > 0 then 'Igrejinha'
    else null
  end;

insert into inspection_status_events (
  inspection_id,
  from_status,
  to_status,
  changed_at,
  changed_by
)
select
  i.id,
  null,
  i.status,
  coalesce(i.created_at, now()),
  i.created_by
from inspections i
where not exists (
  select 1
  from inspection_status_events e
  where e.inspection_id = i.id
);

