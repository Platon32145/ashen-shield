-- Existing projects: run this entire file in Supabase SQL Editor.
-- Keeps all saved content, inventory, accounts and policies.
create or replace function public.audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(user_id, entity_type, entity_id, old_value, new_value)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(to_jsonb(new)->>'item_id', to_jsonb(new)->>'id', '1'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create or replace function public.stamp_content() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.content) <> 'object'
    or not (new.content ?& array['title','description','about','rules','report','author'])
    or jsonb_typeof(new.content->'rules') <> 'array'
    or jsonb_array_length(new.content->'rules') <> 3
    or octet_length(new.content::text) > 200000 then
    raise exception 'Invalid content: required fields, three rules, maximum 200000 bytes';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
