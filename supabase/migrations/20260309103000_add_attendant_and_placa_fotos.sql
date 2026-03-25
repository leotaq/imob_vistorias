do $$ begin
  alter type inspection_type add value if not exists 'placa_fotos';
exception
  when duplicate_object then null;
end $$;

alter table people
  drop constraint if exists people_role_check;

alter table people
  add constraint people_role_check
  check (role in ('manager', 'inspector', 'attendant'));
