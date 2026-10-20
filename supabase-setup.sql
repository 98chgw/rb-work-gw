-- 통합 사이트 — Supabase ▸ SQL Editor 에 붙여넣고 Run (이미 있는 표는 그대로 둠)

-- ① 기본계획·현안 코멘트 (예전 3장 사이트와 같은 표)
create table if not exists public.comments (
  id          text primary key,
  parent_id   text references public.comments(id) on delete cascade,  -- 답변이면 원 코멘트 id
  idx         integer,          -- 본문 블록 번호
  excerpt     text,             -- 코멘트 단 부분 발췌
  section     text,             -- 절 제목
  author      text,
  body        text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.comments enable row level security;

grant select, insert, update, delete on public.comments to anon;

drop policy if exists "comments_read"   on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_update" on public.comments;
drop policy if exists "comments_delete" on public.comments;

create policy "comments_read"   on public.comments for select to anon using (true);
create policy "comments_insert" on public.comments for insert to anon with check (true);
create policy "comments_update" on public.comments for update to anon using (true) with check (true);
create policy "comments_delete" on public.comments for delete to anon using (true);

-- ② 컨설팅 수정표 (예전 원주·정선 컨설팅 사이트와 같은 표)

-- 1) 수정 완료 체크 : 항목 번호(T06, X24, typo-3, req-5 …)마다 한 줄
create table if not exists public.wonju_checks (
  item_id     text primary key,
  done        boolean not null default false,
  author      text,
  updated_at  timestamptz not null default now()
);

-- 2) 코멘트 : 답변은 parent_id 로 원 코멘트를 가리킴
create table if not exists public.wonju_comments (
  id          text primary key,
  parent_id   text references public.wonju_comments(id) on delete cascade,
  ckey        text,             -- 코멘트 단 위치 (예: T06:fix:1, X21, memo-12)
  excerpt     text,             -- 그 위치의 발췌문
  section     text,             -- 장·카드 제목
  author      text,
  body        text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.wonju_checks   enable row level security;
alter table public.wonju_comments enable row level security;

grant select, insert, update, delete on public.wonju_checks   to anon;
grant select, insert, update, delete on public.wonju_comments to anon;

drop policy if exists "wonju_checks_read"   on public.wonju_checks;
drop policy if exists "wonju_checks_insert" on public.wonju_checks;
drop policy if exists "wonju_checks_update" on public.wonju_checks;
drop policy if exists "wonju_checks_delete" on public.wonju_checks;
create policy "wonju_checks_read"   on public.wonju_checks for select to anon using (true);
create policy "wonju_checks_insert" on public.wonju_checks for insert to anon with check (true);
create policy "wonju_checks_update" on public.wonju_checks for update to anon using (true) with check (true);
create policy "wonju_checks_delete" on public.wonju_checks for delete to anon using (true);

drop policy if exists "wonju_comments_read"   on public.wonju_comments;
drop policy if exists "wonju_comments_insert" on public.wonju_comments;
drop policy if exists "wonju_comments_update" on public.wonju_comments;
drop policy if exists "wonju_comments_delete" on public.wonju_comments;
create policy "wonju_comments_read"   on public.wonju_comments for select to anon using (true);
create policy "wonju_comments_insert" on public.wonju_comments for insert to anon with check (true);
create policy "wonju_comments_update" on public.wonju_comments for update to anon using (true) with check (true);
create policy "wonju_comments_delete" on public.wonju_comments for delete to anon using (true);
