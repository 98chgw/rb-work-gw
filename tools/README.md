# 내용 갱신용 도구 (Python 3, 사이트 실행에는 필요 없음)

## 3장 본문을 새 판으로 바꿀 때
python3 tools/gen_plan.py 새판.html src/plan/content_ch3.js 새판.html

## 화암면(또는 다른 읍·면) 현안 문서를 바꿀 때
python3 tools/gen_hwaam.py 화암면_지역현안_및_발전방향.html src/issues/content_hwaam.js /tmp/hw.css
python3 tools/scope_css.py /tmp/hw.css src/issues/hwaam.scoped.css ".v-hw .hwbody"
python3 tools/dark_hwaam.py src/issues/hwaam.scoped.css src/issues/hwaam.dark.css

## 화면 스타일을 고칠 때 — tools/*.index.css.orig 를 고친 뒤
python3 tools/scope_css.py tools/plan.index.css.orig src/plan/plan.scoped.css .v-doc
python3 tools/scope_css.py tools/consult.index.css.orig src/consult/consult.scoped.css .v-consult

## 특화지구 필지 분석 (tools/shp)
작업 컴퓨터 경로가 코드에 박혀 있어 참고용이에요. 순서: `build_raster.py`(필지 10m 래스터) → `analyze.py`(유형별 후보 → results.json) → `maps.py`(지도 PNG) → `export_geo.py`(GeoJSON).
자료: 용도지역.gpkg(필지 토지특성정보 2024.8), 개발진흥지구 shp(베셀 중부원점 → EPSG:5179 변환), 국토통계 인구격자, 농어촌체험휴양마을 CSV.
기준: 농식품부 「농촌특화지구 활성화 방안」(2026.7) Ⅴ장 유형별 지정 기준.

## 현안 문서 생성 (tools/issues)
`build_issues.py` 한 번이면 SHP 검토 절 · 부문별 말풍선(callouts.py) · PDF 도면 · FGI 회의록(fgi2html.py)을 넣어 `src/issues/content_*.js`를 다시 만들어요.
