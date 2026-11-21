-- 使い捨てのPostgreSQLで実行。既存の通常ランキングを変更しない確認。
do $$
declare v jsonb; a uuid:='11111111-2222-4333-8444-555555555555';
  l uuid:='11111111-2222-4333-8444-666666666666';
  h bytea:=decode(repeat('aa',32),'hex'); p uuid;
begin
 if (select count(*) from information_schema.tables
   where table_schema='private' and table_name like 'kamereoru_ta_%')<>10 then
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
 perform private.kamereoru_ta_launch('11111111-2222-4333-8444-777777777777',null,false,null,'green','0.1.0');
 v:=private.kamereoru_ta_stats();
 if (v->>'totalPlays')::integer<>2 or (v->>'participantCount')::integer<>0 then
   raise exception 'stats incorrect: %',v;end if;
 v:=private.kamereoru_ta_ranking_page(null,null,100);
 if (v->>'nameCount')::integer<>0 or jsonb_array_length(v->'rows')<>0 then
  raise exception 'empty ranking incorrect';end if;
end $$;
