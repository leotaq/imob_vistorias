alter table if exists people
  add column if not exists phone text null;

do $$ begin
  alter table people
    add constraint people_phone_check check (phone is null or phone ~ '^[+]?[0-9]{10,15}$');
exception
  when duplicate_object then null;
end $$;
