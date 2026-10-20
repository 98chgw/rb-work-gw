# 농촌공간 재구조화 및 재생 기본계획 — 통합 작업 사이트

예전 두 사이트(정선 3장 기본구상 · 정선/원주 컨설팅 수정표)와 화암면 현안 문서를 한 사이트로 합친 것입니다.

## 구성
| 대분류 | 소분류 | 내용 |
|---|---|---|
| 한눈에 | — | 미반영 코멘트·수정 완료 현황, 최근 코멘트, 미반영 코멘트 전체 복사 |
| 기본계획(안) | 1장 ~ 6장 | **3장 기본구상만 내용 있음**, 나머지는 자리만 |
| 컨설팅 | 정선 · 원주 | 컨설팅 수정표 (완료 체크·코멘트) |
| 현안 및 발전방향 | 정선군 → 9개 읍·면 | **화암면만 내용 있음**, 나머지는 자리만 |

주소로 바로 열기: `?p=plan-3`, `?p=consult-wonju`, `?p=issue-jeongseon-hwaam` (링크를 그대로 보내면 그 화면이 열림)

## 배포 (Vercel)
1. 이 폴더를 GitHub 저장소에 올리고 Vercel에서 가져오기 (Framework: Vite)
2. Settings → Environment Variables 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` 입력
3. 예전 3장 사이트가 **다른** Supabase 프로젝트를 썼다면 `VITE_PLAN_SUPABASE_URL`, `VITE_PLAN_SUPABASE_KEY` 에 그 값을 넣으면 기존 3장 코멘트를 그대로 이어서 씀
4. 같은 프로젝트를 쓴다면 `supabase-setup.sql` 을 한 번 실행 (이미 있는 표는 건드리지 않음)

## 코멘트 저장 위치
- 기본계획 3장 · 읍·면 현안 문서 → `comments` 표 (현안 문서 코멘트는 id가 `iss-hwaam~` 로 시작)
- 컨설팅 수정표 → `wonju_checks`, `wonju_comments` 표 (정선 항목은 `J-` 로 시작)
- 환경 변수가 없으면 이 브라우저에만 저장

## 폴더
- `src/Hub.jsx` — 머리(대분류·소분류), 주소, 한눈에 보기, 빈 자리 화면
- `src/plan/` — 문서 보기(3장·현안 공용), 코멘트
- `src/consult/` — 컨설팅 수정표
- `src/issues/` — 읍·면 현안 문서
- `tools/` — 내용·스타일 갱신용 Python 스크립트 (tools/README.md)
