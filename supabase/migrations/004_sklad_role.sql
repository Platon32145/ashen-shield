-- Run after 003_reports.sql on an existing Supabase project.
-- Sklad can manage warehouse quantities and reports, but not site content.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('viewer', 'Sklad', 'admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_warehouse_operator()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('Sklad', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_warehouse_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_warehouse_operator() TO anon, authenticated;

DROP POLICY IF EXISTS "Admin reads reports" ON public.reports;
CREATE POLICY "Warehouse operators read reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_warehouse_operator());

CREATE OR REPLACE FUNCTION public.search_reports(p_query text default '', p_page integer default 0)
RETURNS SETOF public.reports
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_warehouse_operator() THEN
    RAISE EXCEPTION 'Forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY SELECT r.* FROM public.reports r
    WHERE position(lower(trim(p_query)) in lower(r.body || ' ' || r.author)) > 0
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 50 OFFSET greatest(0, least(p_page, 100000)) * 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_report(p_body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_warehouse_operator() THEN
    RAISE EXCEPTION 'Forbidden' USING errcode = '42501';
  END IF;
  IF length(trim(p_body)) NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'Invalid report';
  END IF;
  INSERT INTO public.reports(user_id, author, kind, body)
    VALUES (auth.uid(), public.report_author(), 'manual', trim(p_body));
END;
$$;

-- Keep the atomic stock update and automatic warehouse report, but allow Sklad.
CREATE OR REPLACE FUNCTION public.set_quantity(
  p_id text, p_quantity bigint, p_version integer,
  p_name text DEFAULT NULL, p_stack integer DEFAULT 64
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  previous bigint;
  delta bigint;
  changed integer;
  amount bigint;
  chests bigint;
  stacks bigint;
  loose bigint;
  units text[] := '{}';
  actor text;
  description text;
BEGIN
  IF NOT public.is_warehouse_operator() THEN
    RAISE EXCEPTION 'Forbidden' USING errcode = '42501';
  END IF;
  IF p_quantity < 0 OR p_quantity > 1000000000 OR p_stack NOT IN (1, 16, 64, 99) THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;
  SELECT total_quantity INTO previous FROM public.warehouse_items WHERE item_id = p_id FOR UPDATE;
  previous := coalesce(previous, 0);
  IF p_version = -1 THEN
    INSERT INTO public.warehouse_items(item_id, total_quantity, updated_by)
      VALUES (p_id, p_quantity, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.warehouse_items
      SET total_quantity = p_quantity, version = version + 1,
          updated_at = now(), updated_by = auth.uid()
      WHERE item_id = p_id AND version = p_version;
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN RAISE EXCEPTION 'conflict: reload inventory'; END IF;
  delta := p_quantity - previous;
  IF delta = 0 THEN RETURN; END IF;
  amount := abs(delta);
  chests := amount / (54 * p_stack);
  stacks := (amount % (54 * p_stack)) / p_stack;
  loose := amount % p_stack;
  IF chests > 0 THEN units := array_append(units, public.ru_unit(chests, 'двойной сундук', 'двойных сундука', 'двойных сундуков')); END IF;
  IF stacks > 0 THEN units := array_append(units, public.ru_unit(stacks, 'стак', 'стака', 'стаков')); END IF;
  IF loose > 0 THEN units := array_append(units, public.ru_unit(loose, 'штуку', 'штуки', 'штук')); END IF;
  actor := public.report_author();
  description := 'Сегодня ' || to_char(now() AT TIME ZONE 'Europe/Moscow', 'DD.MM.YYYY') ||
    ' в ' || to_char(now() AT TIME ZONE 'Europe/Moscow', 'HH24:MI') ||
    ' (МСК) я, ' || actor || ', ' || CASE WHEN delta > 0 THEN 'принёс на склад: ' ELSE 'забрал со склада: ' END ||
    coalesce(nullif(trim(p_name), ''), p_id) || ' — ' || array_to_string(units, ', ') || '.';
  INSERT INTO public.reports(user_id, author, kind, body, changes)
    VALUES (auth.uid(), actor, 'warehouse', description,
      jsonb_build_array(jsonb_build_object('item_id', p_id, 'name', coalesce(p_name, p_id),
        'delta', delta, 'before', previous, 'after', p_quantity, 'stack', p_stack)));
END;
$$;
