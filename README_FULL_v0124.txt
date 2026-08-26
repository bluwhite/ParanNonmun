파란 논문 v0.12.4 FULL 통합본

이 ZIP은 이전 패치에 덮어쓰는 용도가 아니라,
현재까지 작성한 파란 논문의 전체 소스입니다.
새 배포 폴더/새 GitHub Pages 저장소에 이 구조 그대로 올릴 수 있습니다.

[포함 기능]

1. 논문 목록
- Univer Sheets 기반 스프레드시트
- 사용자 열 추가/이동/이름 변경/삭제
- 기본 시스템 열 유지
- 파란논문.json 자동 저장
- 셀 찾기
- 행 어느 컬럼이든 더블클릭하면 해당 행의 PDF 열기

2. 논문 추가
- AI / RIS / MLA / APA 분석
- 여러 저자 구분자: ·
- BR 줄바꿈 정리
- 학술지-학회명 reference-data/journal-info.json 보완
- 권/호/시작페이지/끝페이지 누락 경고
- 학위논문은 해당 누락 경고 제외
- Groq AI
  Primary: qwen/qwen3.6-27b
  Fallback: openai/gpt-oss-20b strict structured output
- AI 오류 상세 진단
- AI가 발행기관/대학교/연구기관을 학회명(내부 publisher)에 넣을 수 있음

3. AI 설정
- Groq API Key
- 파란논문_ai.json에 AES-GCM 암호화 저장
- 복호화 키는 현재 브라우저 IndexedDB에 저장
- 논문 폴더와 연결

4. PDF 연결
- 파일 선택창은 Downloads에서 시작/최근 위치 기억
- 선택 행의 논문명이 없으면 중단
- PDF를 논문 폴더로 복사하면서 논문명으로 이름 변경
- 파일명 금지문자 정리
- 중복 파일은 (2), (3)... 자동 회피
- PDF 열에는 .pdf 제외 파일명 기록
- 가능하면 원본 PDF 삭제 시도

5. PDF 편집기
- 연속 세로 스크롤
- 읽기 모드에서 실제 PDF 텍스트 드래그 선택/복사
- 편집 모드: 형광펜/메모/실행취소/편집취소/저장
- PDF 표준 Annotation 기록
- 저장 시 원본 PDF 덮어쓰기
- ?page=N 이동
- 스캔 이미지 PDF는 OCR 없이는 텍스트 선택 불가

6. PDF 메모 검색
- 현재 논문 폴더의 PDF Text/FreeText Annotation 검색
- 결과 클릭 시 해당 PDF와 페이지 열기

7. 기존 Excel 가져오기
- .xlsx / .xlsm / .xls
- 작업 폴더가 연결되어 있으면 파일 선택창이 그 폴더에서 시작
- 모든 시트 첫 20행에서 제목 행 자동 탐색
- 기존 all_list 4행 구조 지원
- 현재 시트 컬럼 이름과 Excel 컬럼 이름으로 매칭
- 사용자 커스텀 열도 같은 이름이면 가져오기
- 기존 목록 마지막 행 뒤에 추가
- PDF 열의 .pdf 확장자는 제거

8. 참고문헌 양식 관리
- 파란논문.json 내부 referenceFormatGroups에 저장
- 양식 정보가 없으면 기본 3개 그룹 자동 생성/저장
  경사대양식 / 양식1 / 양식2
- 각 그룹은 6개 형식 보유
  학회지_국내 / 학위_국내 / 단행본_국내
  학회지_해외 / 학위_해외 / 단행본_해외
- 그룹 추가/복제/삭제/이름 변경
- 오른쪽에서 6개 템플릿 직접 편집
- 템플릿 안에서 Ctrl+I(Cmd+I)로 이탤릭 직접 저장
- AU/PY/TI/JO/VL/IS/PB/SP/EP/VL+IS/VL(IS)/VL/IS 코드 안내
- schemaVersion 5

9. 참고문헌 출력
- 참고문헌 양식 그룹 선택
- 확인(*) 값이 있는 행 출력
- 기본 순서: 현재 시트 행 순서
- 한글 먼저 정렬:
  한글 자료를 가나다순으로 먼저,
  그 뒤 영문+기타를 한 그룹으로 정렬
- 시트 순서 복원
- 결과 직접 수정 가능
- 템플릿의 이탤릭을 실제 출력에 반영
- 일반 텍스트 복사
- Word용 서식 복사: ClipboardItem text/html + text/plain
- 한글용 복사 테스트:
  실제 copy 이벤트에서 clipboardData.setData("text/html", ...)
  이탤릭을 <i>...</i>로 변환하고 StartFragment/EndFragment 포함
  (아래한글 호환성은 현재 테스트 중인 방식)

[전체 폴더 구조]

/
├─ index.html
├─ main.js
├─ shared.js
├─ styles.css
├─ ai-config/
│  └─ credential-store.js
├─ excel-import/
│  └─ excel-import.js
├─ paper-add/
│  ├─ index.html
│  ├─ add.js
│  └─ add.css
├─ paper-data/
│  └─ data-store.js
├─ paper-sheet/
│  └─ univer-sheet.js
├─ pdf-editor/
│  ├─ index.html
│  ├─ editor.js
│  └─ editor.css
├─ pdf-link/
│  └─ pdf-link.js
├─ pdf-search/
│  └─ note-search.js
├─ reference-data/
│  └─ journal-info.json
├─ reference-format/
│  └─ format-manager.js
├─ reference-import/
│  ├─ ai-parser.js
│  ├─ apa-parser.js
│  ├─ author-utils.js
│  ├─ mla-parser.js
│  └─ ris-parser.js
└─ reference-output/
   └─ output.js

[주의]
- Chrome/Edge의 File System Access API를 사용하므로 HTTPS(GitHub Pages) 권장.
- 논문 PDF와 파란논문.json은 사용자가 선택한 로컬 논문 폴더에 저장됩니다.
- CDN을 사용하므로 최초 로딩에는 인터넷 연결이 필요합니다.
