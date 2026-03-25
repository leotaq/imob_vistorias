do $$ begin
  alter type inspection_status add value if not exists 'finalized';
exception
  when duplicate_object then null;
end $$;
