// Supabase Edge Function `kamereoru` の入口（Deno）。
// 配備：supabase functions deploy kamereoru --no-verify-jwt （公開ゲームから匿名で呼ぶため。他のゲームの関数と同じ設定）
// 必要な環境値：SUPABASE_DB_URL（Supabase が自動で設定）、KAMEREORU_IP_SALT（頻度制限用。任意の長い文字列）、
//               KAMEREORU_ALLOWED_ORIGIN（公開URLのオリジン。未設定なら *）
// 秘密情報をコードやログへ書かない。
import postgres from 'npm:postgres@3.4.5';
import { createHandler } from '../_shared/kamereoru/handlers.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 3, idle_timeout: 20 });

const handler = createHandler({
  db: { query: (text: string, params: unknown[] = []) => sql.unsafe(text, params as any[]) as unknown as Promise<any[]> },
  ipSalt: Deno.env.get('KAMEREORU_IP_SALT') ?? '',
  allowedOrigin: Deno.env.get('KAMEREORU_ALLOWED_ORIGIN') ?? '*',
  waitUntil: (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil?.(p),
  log: (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'kamereoru', ...entry })),
});

Deno.serve(handler);
