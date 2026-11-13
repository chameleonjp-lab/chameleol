-- New start negotiation stays private, validates direct callers, and retains the old function.
do $$
declare
  req uuid := gen_random_uuid();
  launch uuid := gen_random_uuid();
  secret bytea := decode(repeat('01', 32), 'hex');
  first jsonb;
  again jsonb;
  candidate text[];
  f regprocedure := 'private.kamereoru_start_compatible(uuid,bytea,uuid,text,text,text,text[])'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'new start function exposed';
  end if;
  if to_regprocedure('private.kamereoru_start(uuid,bytea,uuid,text,text,text,text,text)') is null then
    raise exception 'legacy function removed';
  end if;
  first := private.kamereoru_start_compatible(req, secret, launch, 'bonus', 'bonus', '0.1.0', array['kamereoru-rules-v1','kamereoru-rules-v3']);
  if first->>'rulesVersion' <> 'kamereoru-rules-v3' then raise exception 'newest mutually supported version not chosen'; end if;
  update private.kamereoru_config set accepted_rules_versions=array['kamereoru-rules-v1'], accepting_ranked_starts=false;
  again := private.kamereoru_start_compatible(req, secret, launch, 'bonus', 'bonus', '0.1.0', array['kamereoru-rules-v3','kamereoru-rules-v1']);
  if first - 'created' <> again - 'created' then raise exception 'accepted start changed after settings update'; end if;
  begin
    perform private.kamereoru_start_compatible(req, secret, launch, 'BONUS', 'bonus', '0.1.0', array['kamereoru-rules-v3']);
    raise exception 'display name conflict allowed';
  exception when sqlstate 'KM409' then null; end;
  begin
    perform private.kamereoru_start_compatible(req, null, launch, 'bonus', 'bonus', '0.1.0', array['kamereoru-rules-v3']);
    raise exception 'null secret allowed';
  exception when sqlstate 'KM403' then null; end;
  begin
    perform private.kamereoru_start_compatible(req, secret, launch, 'bonus', 'bonus', '0.1.0', array['kamereoru-rules-v1']);
    raise exception 'unsupported saved version returned';
  exception when sqlstate 'KM409' then null; end;
  for candidate in select x from (values
    (array[]::text[]),
    (array['kamereoru-rules-v4']),
    (array['kamereoru-rules-v2']),
    (array['future']),
    (array['kamereoru-rules-v1','kamereoru-rules-v1']),
    (array['kamereoru-rules-v1','kamereoru-rules-v3','kamereoru-rules-v1']),
    (array[null]::text[]),
    (null::text[]),
    (array[['kamereoru-rules-v1','kamereoru-rules-v3']])
  ) as invalid(x) loop
    begin
      perform private.kamereoru_start_compatible(gen_random_uuid(), secret, gen_random_uuid(), 'bonus', 'bonus', '0.1.0', candidate);
      raise exception 'invalid supported list accepted: %', candidate;
    exception when sqlstate 'KM422' then null; end;
  end loop;
  update private.kamereoru_config set accepted_rules_versions=array['kamereoru-rules-v3','kamereoru-rules-v1'], accepting_ranked_starts=true;
end $$;

set role anon;
do $$ begin
  begin
    perform private.kamereoru_start_compatible(gen_random_uuid(), decode(repeat('00',32),'hex'), gen_random_uuid(), 'x', 'x', '0.1.0', array['kamereoru-rules-v3']);
    raise exception 'anon called compatible start';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'kamereoru_bonus: ok' as result;
