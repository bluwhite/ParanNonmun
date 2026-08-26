파란 논문 v0.8.0 — 변경 파일만

기존 VBA를 참고한 부분
- all_list 12열 구조를 그대로 사용
  확인(*) / 저자 / 출판연도 / 논문명 / 학술지명 / 권 / 호 / 학회명 / 시작페이지 / 끝페이지 / 메모 / PDF

새 구조
- 선택 폴더 루트에 파란논문.json 자동 생성
- 폴더 선택 시 파란논문.json을 읽어 목록 표시
- 셀을 수정하면 0.25초 후 자동 저장, 셀을 벗어나면 즉시 저장
- 논문 추가 버튼 -> 별도 창
- RIS 붙여넣기 -> 자동 분석 -> 12열 미리보기 -> 목록에 추가
- 추가 후 파란논문.json에 즉시 저장하고 메인 창 자동 갱신
- 기존 PDF 메모 검색과 PDF 편집기는 유지

변경 파일
- shared.js
- index.html
- styles.css
- main.js
- pdf-editor/index.html
- pdf-editor/editor.js

새 파일/폴더
- paper-data/data-store.js
- reference-import/ris-parser.js
- paper-add/index.html
- paper-add/add.css
- paper-add/add.js

RIS 매핑
- 저자: AU, A1
- 출판연도: PY, Y1, DA에서 4자리 연도
- 논문명: TI, T1, CT
- 학술지명: JO, JF, JA, T2
- 권: VL
- 호: IS
- 학회명: PB
- 시작/끝페이지: SP / EP
- 메모: N1, N2
- PDF: L1, L2가 PDF 경로일 경우 파일명

배포
ZIP 안의 파일만 같은 위치에 덮어쓰거나 새 폴더를 추가한 뒤 Commit -> Push 합니다.
