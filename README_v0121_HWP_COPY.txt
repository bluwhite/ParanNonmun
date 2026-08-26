파란 논문 v0.12.1 - 아래한글 전용 복사

교체 파일
- shared.js
- index.html
- styles.css
- reference-output/output.js

관련 기존 파일도 ZIP에 함께 포함
- main.js
- paper-data/data-store.js
- paper-sheet/univer-sheet.js
- reference-format/format-manager.js

복사 버튼
1. 일반 텍스트 복사
   - 서식 없이 텍스트만 복사

2. 한글용 복사
   - 아래한글 호환성을 높이기 위한 별도 경로
   - 현재 참고문헌 결과를 화면 밖의 실제 DOM 문단으로 복제
   - <em>/<i> 이탤릭뿐 아니라 style="font-style: italic"도 명시
   - 그 DOM 전체를 Range로 실제 선택
   - document.execCommand("copy")를 실행하여
     브라우저의 일반 Ctrl+C에 가까운 native rich-copy 경로 사용
   - 복사 후 기존 사용자의 선택 영역은 복원

3. Word용 서식 복사
   - 기존 ClipboardItem 방식
   - text/html + text/plain 동시 기록
   - Word 등에서 사용

사용
- 아래한글: [한글용 복사] -> 한글에서 Ctrl+V
- Word: [Word용 서식 복사] -> Word에서 Ctrl+V

주의
- 아래한글 버전과 브라우저의 클립보드 처리 방식에 따라
  HTML 서식 지원 범위는 차이가 있을 수 있습니다.
- 이번 방식은 ClipboardItem으로 HTML 문자열을 직접 쓰는 기존 방식과 달리,
  브라우저가 실제 렌더링된 DOM을 복사하도록 하여 한글 호환성을 높였습니다.
