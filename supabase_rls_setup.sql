-- ============================================================
-- conf-quality-scheduler: Supabase RLS / Storage 정책 점검·설정
-- Supabase 대시보드 → SQL Editor에서 실행하세요.
-- 이 앱은 로그인 없이 anon key로 접속하는 팀 공용 도구이므로,
-- 각 테이블에 대해 anon 역할의 select/insert/update/delete를 모두 허용합니다.
-- ============================================================

-- 1. 테이블별 RLS 활성화 (이미 되어 있다면 무해함)
alter table public.quality_types enable row level security;
alter table public.quality_products enable row level security;
alter table public.quality_history enable row level security;
alter table public.quality_health_certs enable row level security;
alter table public.quality_certificates enable row level security;
alter table public.quality_settings enable row level security;

-- 2. 기존 정책 제거 후 재생성 (이름 충돌 방지)
drop policy if exists "anon_all_quality_types" on public.quality_types;
drop policy if exists "anon_all_quality_products" on public.quality_products;
drop policy if exists "anon_all_quality_history" on public.quality_history;
drop policy if exists "anon_all_quality_health_certs" on public.quality_health_certs;
drop policy if exists "anon_all_quality_certificates" on public.quality_certificates;
drop policy if exists "anon_all_quality_settings" on public.quality_settings;

create policy "anon_all_quality_types" on public.quality_types
  for all to anon using (true) with check (true);

create policy "anon_all_quality_products" on public.quality_products
  for all to anon using (true) with check (true);

create policy "anon_all_quality_history" on public.quality_history
  for all to anon using (true) with check (true);

create policy "anon_all_quality_health_certs" on public.quality_health_certs
  for all to anon using (true) with check (true);

create policy "anon_all_quality_certificates" on public.quality_certificates
  for all to anon using (true) with check (true);

create policy "anon_all_quality_settings" on public.quality_settings
  for all to anon using (true) with check (true);

-- 3. Storage 버킷(quality-files) 생성 및 공개 읽기 설정
insert into storage.buckets (id, name, public)
values ('quality-files', 'quality-files', true)
on conflict (id) do update set public = true;

-- 4. Storage 객체(quality-files 버킷) RLS 정책
drop policy if exists "anon_all_quality_files" on storage.objects;
create policy "anon_all_quality_files" on storage.objects
  for all to anon
  using (bucket_id = 'quality-files')
  with check (bucket_id = 'quality-files');
