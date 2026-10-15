-- Run in Supabase SQL Editor once. Public reads, administrator-only writes.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Интендант',
  role text not null default 'viewer' check (role in ('viewer', 'admin'))
);
alter table public.profiles enable row level security;
create policy "Own profile" on public.profiles for select to authenticated using (id = auth.uid());

create function public.is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.site_content (
  id integer primary key check (id = 1),
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.warehouse_items (
  item_id text primary key check (item_id ~ '^[a-z0-9_]+$'),
  total_quantity bigint not null default 0 check (total_quantity between 0 and 1000000000),
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
alter table public.warehouse_items enable row level security;
alter table public.audit_log enable row level security;
create policy "Read content" on public.site_content for select using (true);
create policy "Edit content" on public.site_content for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Read inventory" on public.warehouse_items for select using (true);
create policy "Read audit as admin" on public.audit_log for select to authenticated using (public.is_admin());

create function public.stamp_content() returns trigger language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.content) <> 'object'
    or not (new.content ?& array['title','description','about','rules','report','author'])
    or jsonb_typeof(new.content->'rules') <> 'array'
    or jsonb_array_length(new.content->'rules') <> 3
    or octet_length(new.content::text) > 200000 then
    raise exception 'Invalid content';
  end if;
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end;
$$;
create trigger stamp_content before update on public.site_content for each row execute function public.stamp_content();

create function public.audit_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(user_id, entity_type, entity_id, old_value, new_value)
  values(auth.uid(), tg_table_name, coalesce(to_jsonb(new)->>'item_id', to_jsonb(new)->>'id', '1'),
  case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
create trigger inventory_audit after insert or update on public.warehouse_items for each row execute function public.audit_change();
create trigger content_audit after update on public.site_content for each row execute function public.audit_change();

-- Atomic compare-and-swap: administrators cannot silently overwrite each other.
create function public.set_quantity(p_id text, p_quantity bigint, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_quantity < 0 or p_quantity > 1000000000 then raise exception 'Invalid quantity'; end if;
  if p_version = -1 then
    insert into public.warehouse_items(item_id, total_quantity, updated_by)
    values(p_id, p_quantity, auth.uid()) on conflict do nothing;
  else
    update public.warehouse_items set total_quantity = p_quantity, version = version + 1,
      updated_at = now(), updated_by = auth.uid()
    where item_id = p_id and version = p_version;
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then raise exception 'conflict: reload inventory'; end if;
end;
$$;
revoke all on function public.set_quantity(text,bigint,integer) from public;
grant execute on function public.set_quantity(text,bigint,integer) to authenticated;

insert into public.site_content(id,content) values(1, jsonb_build_object(
  'title', E'На страже.\nДо последнего рассвета.',
  'description', 'Мы храним покой за стенами крепости. Сопровождаем караваны, защищаем земли и стоим плечом к плечу, когда наступает ночь.',
  'about', E'Наш орден родился у северных ворот, когда от старой стражи остались лишь пепел и обещание вернуться. Мы подняли щиты и дали клятву: ни одна дорога не будет забыта, ни один союзник не останется один.\n\nСегодня Пепельный Щит — это дозорные, строители и мастера. Мы возводим стены, бережём запасы и пишем историю своими поступками.',
  'rules', jsonb_build_array('Честь превыше награды','Плечом к плечу до конца','Каждый ресурс — общее дело'),
  'report', 'Восточный тракт свободен. Караван с железом прибыл без потерь. Северная башня укреплена, а в оружейной вновь слышен звон молотов. Ночная стража заступила на пост.',
  'author', 'Командор Эйрик · Северный дозор'
));
