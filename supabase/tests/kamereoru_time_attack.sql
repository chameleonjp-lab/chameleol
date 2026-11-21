-- 使い捨てのPostgreSQLで実行。既存の通常ランキングを変更しない確認。
do $$
declare v jsonb; a uuid:='11111111-2222-4333-8444-555555555555';
  l uuid:='11111111-2222-4333-8444-666666666666';
  h bytea:=decode(repeat('aa',32),'hex'); p uuid;
  guest uuid:='11111111-2222-4333-8444-777777777777';
begin
 if (select count(*) from information_schema.tables
   where table_schema='private' and table_type='BASE TABLE' and table_name like 'kamereoru_ta_%')<>10 then
    raise exception 'ten dedicated tables expected'; end if;
 if has_table_privilege('anon','private.kamereoru_ta_starts','select') or
    has_table_privilege('authenticated','private.kamereoru_ta_results','insert') then
    raise exception 'private tables exposed'; end if;
 if has_function_privilege('anon','private.kamereoru_ta_start(uuid,uuid,bytea,text,text,text,text,bigint,text)','execute')
 then raise exception 'private function exposed';end if;
 begin
  perform private.kamereoru_ta_start(a,l,h,'Tester','Tester','kamereoru-time-attack-rules-v1','0.1.0',12,'red');
  raise exception 'start must be disabled by default';
 exception when sqlstate 'KM503' then null;end;
 begin
  perform private.kamereoru_ta_launch(guest,null,false,null,'green','0.1.0');
  raise exception 'guest count must be closed before the first release';
 exception when sqlstate 'KM503' then null;end;
 update private.kamereoru_ta_config set accepting=true where id=1;
 v:=private.kamereoru_ta_start(a,l,h,'Tester','Tester','kamereoru-time-attack-rules-v1','0.1.0',12,'red');
 p:=(v->>'playId')::uuid;
 if p is null or v->>'family'<>'red' or (v->>'seed')::bigint<>12 then
  raise exception 'start result invalid';end if;
 if (private.kamereoru_ta_start(a,l,h,'Tester','Tester','kamereoru-time-attack-rules-v1','0.1.0',999,'blue')->>'playId')::uuid<>p then
  raise exception 'retry changed play';end if;
 begin
  perform private.kamereoru_ta_start(a,l,h,'Other','Other','kamereoru-time-attack-rules-v1','0.1.0',12,'red');
  raise exception 'conflicting same request accepted';
 exception when sqlstate 'KM409' then null;end;
 v:=private.kamereoru_ta_launch(l,p,true,h,'red','0.1.0');
 if v->>'counted'<>'true' then raise exception 'launch not counted';end if;
 perform private.kamereoru_ta_launch(l,p,true,h,'red','0.1.0');
 begin
  perform private.kamereoru_ta_launch(l,p,true,decode(repeat('bb',32),'hex'),'red','0.1.0');
  raise exception 'wrong secret was accepted for a ranked launch retry';
 exception when sqlstate 'KM403' then null;end;
 update private.kamereoru_ta_config set accepting=false where id=1;
 perform private.kamereoru_ta_launch(guest,null,false,null,'green','0.1.0');
 perform private.kamereoru_ta_launch(guest,null,false,null,'green','0.1.0');
 v:=private.kamereoru_ta_stats();
 if (v->>'totalPlays')::integer<>2 or (v->>'participantCount')::integer<>0 then
   raise exception 'stats incorrect: %',v;end if;
 insert into private.kamereoru_ta_results(play_id,result_id,body,display_name,name_key,family)
 values(p,gen_random_uuid(),'{}'::jsonb,'Tester','Tester','red');
 insert into private.kamereoru_ta_jobs(play_id,status,attempts,lease_until,claim_token)
 values(p,'claimed',3,clock_timestamp()-interval '1 second',gen_random_uuid());
 perform private.kamereoru_ta_claim_jobs(1);
 if (select status from private.kamereoru_ta_results where play_id=p) <> 'pending_review' then
  raise exception 'expired worker must leave a record for review';
 end if;
 v:=private.kamereoru_ta_ranking_page(null,null,100);
 if (v->>'nameCount')::integer<>0 or jsonb_array_length(v->'rows')<>0 then
  raise exception 'empty ranking incorrect';end if;
end $$;
