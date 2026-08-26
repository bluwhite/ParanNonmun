파란 논문 v0.9.0 — Univer Sheets 목록 UI 패치

변경 파일만 포함합니다.
- shared.js
- index.html
- main.js
- styles.css
- paper-data/data-store.js
- paper-sheet/univer-sheet.js (신규)

주요 변경
- 논문 목록을 Univer Sheets 0.15.4로 교체
- 일반 스프레드시트처럼 셀 편집, 복사/붙여넣기, 행/열 삽입·삭제, 너비 조절, 서식, Undo/Redo 가능
- 열 추가 버튼 유지
- 선택 열을 좌/우로 이동하는 버튼 추가
- 사용자 열 이름 변경 가능
- 사용자 열 삭제 가능
- 기본 12개 열은 순서 이동 가능하지만 이름 변경/삭제는 자동 취소
- 중복 열 이름 입력은 자동 취소 후 경고
- 시트 전체 snapshot을 파란논문.json에 저장하여 열 너비/서식/추가 시트 등 Univer 상태 보존
- RIS 추가 시 관리 시트의 다음 행에도 자동 반영
- 별도 시트 추가도 snapshot에 보존되며, RIS/논문 목록 데이터는 ID가 paran-paper-list인 관리 시트만 사용

외부 라이브러리
- Univer Sheets core 0.15.4
- 공식 CDN(UNPKG) 방식 사용

주의
- Univer UI를 불러오려면 인터넷 연결이 필요합니다.
- 기존 paper-add의 BR 줄바꿈 패치는 건드리지 않습니다.
