-- 権限の検査（受入試験 SEC-TEST-01 の一部）。公開クライアントの役割から、表と関数に直接触れられないこと。
-- npm run test:sql で、Supabase の役割を模した試験用データベースに対して実行する。

do $$
declare
  t record;
  f record;
  n int := 0;
begin
  for t in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'private' and c.relname like 'kamereoru\_%' and c.relkind = 'r'
  loop
    n := n + 1;
    if not t.relrowsecurity then
      raise exception 'RLS is not enabled on %', t.relname;
    end if;
    if has_table_privilege('anon', t.oid, 'SELECT') or has_table_privilege('anon', t.oid, 'INSERT')
       or has_table_privilege('anon', t.oid, 'UPDATE') or has_table_privilege('anon', t.oid, 'DELETE')
       or has_table_privilege('authenticated', t.oid, 'SELECT') or has_table_privilege('authenticated', t.oid, 'UPDATE') then
      raise exception 'public role can access %', t.relname;
    end if;
  end loop;
  if n < 12 then
    raise exception 'expected 12 kamereoru tables, found %', n;
  end if;
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'private' and p.proname like 'kamereoru\_%'
  loop
    if has_function_privilege('anon', f.oid, 'EXECUTE') or has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'public role can execute %', f.sig;
    end if;
  end loop;
  raise notice 'access ok: % tables', n;
end $$;

-- 実際に anon として操作しても拒否されること
set role anon;
do $$
begin
  begin
    perform 1 from private.kamereoru_results;
    raise exception 'anon could read results';
  exception when insufficient_privilege then null;
  end;
  begin
    update private.kamereoru_bests set rank_avg = 10000;
    raise exception 'anon could update bests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.kamereoru_rebuild_ranking();
    raise exception 'anon could execute rebuild';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.kamereoru_admin_correct('00000000-0000-4000-8000-000000000000', 50, 10000, 'x', 'y');
    raise exception 'anon could execute admin_correct';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
do $$
begin
  begin
    insert into private.kamereoru_starts (request_id, secret_hash, launch_id, display_name, name_key, seed, rules_version, generator_version, game_version)
    values (gen_random_uuid(), decode(repeat('00', 32), 'hex'), gen_random_uuid(), 'x', 'x', 1, 'r', 'g', 'v');
    raise exception 'authenticated could insert starts';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'kamereoru_access: ok' as result;
