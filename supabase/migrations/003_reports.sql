-- Run AFTER 001 (and 002 for older installations). Preserves existing data.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  author text not null,
  kind text not null check (kind in ('manual','warehouse')),
  body text not null check (length(body) between 1 and 12000),
  changes jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists reports_created_idx on public.reports(created_at desc, id desc);
alter table public.reports enable row level security;
create policy "Admin reads reports" on public.reports for select to authenticated using (public.is_warehouse_operator());

-- Search both report text and the author's saved name without PostgREST filter interpolation.
create function public.search_reports(p_query text default '', p_page integer default 0)
returns setof public.reports language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_warehouse_operator() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select r.* from public.reports r
    where position(lower(trim(p_query)) in lower(r.body || ' ' || r.author)) > 0
    order by r.created_at desc,r.id desc limit 50 offset greatest(0,least(p_page,100000))*50;
end;
$$;
revoke all on function public.search_reports(text,integer) from public;
grant execute on function public.search_reports(text,integer) to authenticated;

create or replace function public.report_author() returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.display_name),''), nullif(auth.jwt()->'user_metadata'->>'full_name',''), nullif(auth.jwt()->'user_metadata'->>'name',''), 'Страж')
  from (select 1) s left join public.profiles p on p.id = auth.uid();
$$;
revoke all on function public.report_author() from public;
grant execute on function public.report_author() to authenticated;

create or replace function public.latest_report() returns setof public.reports
language sql stable security definer set search_path = public as $$
  select * from public.reports order by created_at desc, id desc limit 1;
$$;
revoke all on function public.latest_report() from public;
grant execute on function public.latest_report() to anon, authenticated;

create function public.submit_report(p_body text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_warehouse_operator() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if length(trim(p_body)) not between 1 and 12000 then raise exception 'Invalid report'; end if;
  insert into public.reports(user_id,author,kind,body) values(auth.uid(),public.report_author(),'manual',trim(p_body));
end;
$$;
revoke all on function public.submit_report(text) from public;
grant execute on function public.submit_report(text) to authenticated;

create function public.ru_unit(n bigint, one_form text, few_form text, many_form text) returns text
language sql immutable set search_path = public as $$
  select n::text || ' ' || case when n%100 between 11 and 14 then many_form when n%10=1 then one_form when n%10 between 2 and 4 then few_form else many_form end;
$$;

-- Replace old function so clients cannot bypass report creation.
drop function public.set_quantity(text,bigint,integer);
create function public.set_quantity(p_id text, p_quantity bigint, p_version integer, p_name text default null, p_stack integer default 64) returns void
language plpgsql security definer set search_path = public as $$
declare previous bigint; delta bigint; changed integer; amount bigint; chests bigint; stacks bigint; loose bigint; units text[] := '{}'; actor text; description text;
begin
  if not public.is_warehouse_operator() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_quantity < 0 or p_quantity > 1000000000 or p_stack not in (1,16,64,99) then raise exception 'Invalid quantity'; end if;
  select total_quantity into previous from public.warehouse_items where item_id=p_id for update;
  previous := coalesce(previous,0);
  if p_version = -1 then
    insert into public.warehouse_items(item_id,total_quantity,updated_by) values(p_id,p_quantity,auth.uid()) on conflict do nothing;
  else
    update public.warehouse_items set total_quantity=p_quantity,version=version+1,updated_at=now(),updated_by=auth.uid() where item_id=p_id and version=p_version;
  end if;
  get diagnostics changed = row_count;
  if changed=0 then raise exception 'conflict: reload inventory'; end if;
  delta := p_quantity-previous;
  if delta=0 then return; end if;
  amount:=abs(delta); chests:=amount/(54*p_stack); stacks:=(amount%(54*p_stack))/p_stack; loose:=amount%p_stack;
  if chests>0 then units:=array_append(units,public.ru_unit(chests,'двойной сундук','двойных сундука','двойных сундуков')); end if;
  if stacks>0 then units:=array_append(units,public.ru_unit(stacks,'стак','стака','стаков')); end if;
  if loose>0 then units:=array_append(units,public.ru_unit(loose,'штуку','штуки','штук')); end if;
  actor:=public.report_author();
  description:='Сегодня '||to_char(now() at time zone 'Europe/Moscow','DD.MM.YYYY')||' в '||to_char(now() at time zone 'Europe/Moscow','HH24:MI')||' (МСК) я, '||actor||', '||case when delta>0 then 'принёс на склад: ' else 'забрал со склада: ' end||coalesce(nullif(trim(p_name),''),p_id)||' — '||array_to_string(units,', ')||'.';
  insert into public.reports(user_id,author,kind,body,changes) values(auth.uid(),actor,'warehouse',description,jsonb_build_array(jsonb_build_object('item_id',p_id,'name',coalesce(p_name,p_id),'delta',delta,'before',previous,'after',p_quantity,'stack',p_stack)));
end;
$$;
revoke all on function public.set_quantity(text,bigint,integer,text,integer) from public;
grant execute on function public.set_quantity(text,bigint,integer,text,integer) to authenticated;
