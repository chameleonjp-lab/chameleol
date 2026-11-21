-- An official TA result must contain the verified result, even if the RPC is
-- invoked through a PostgreSQL driver that serializes a JSON string twice.
alter table private.kamereoru_ta_results
  add constraint kamereoru_ta_official_result_complete check (
    status <> 'official' or coalesce(
      reason = 'cleared' and buildings = 30 and
      elapsed_ms between 15000 and 9007199254682991 and
      elapsed_cs = (elapsed_ms + 9) / 10 and official_at is not null,
      false
    )
  ) not valid;
