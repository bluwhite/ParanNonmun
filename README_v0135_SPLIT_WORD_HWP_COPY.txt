파란 논문 v0.13.5 - Word / 아래한글 복사 분리

공통 스타일 데이터는 하나만 유지하고,
복사할 때 Word와 아래한글에 맞게 별도 HTML/복사 경로로 변환합니다.

[아래한글용 복사]
- 실제 화면의 참고문헌 영역을 native copy
- 복사 순간 화면 카드용 margin/padding/border 제거
- line-height 180%는 HTML에서 1.8로 전달
- 왼쪽 여백/내어쓰기/글꼴/크기/문단 간격을 inline style로 적용
- 출력 영역 nodeContents만 선택하여 맨 앞 빈 문단 발생을 줄임
- 붙여넣기: Ctrl+Alt+V -> 인터넷 문서

[Word용 복사]
- Word용 깨끗한 HTML을 별도로 생성
- 화면용 wrapper 미포함
- 각 참고문헌: p + span
- margin-top/right/bottom/left
- mso-margin-top-alt / mso-margin-bottom-alt
- text-indent
- line-height + mso-line-height-rule:auto
- font-family/font-size 등 직접 지정
- 붙여넣기: 일반 Ctrl+V

[첫 빈 줄]
기존 Range가 첫 내부 요소의 바깥 경계에서 시작하면서
빈 문단이 만들어질 가능성이 있었습니다.
v0.13.5는 referenceOutputArea의 내용만 선택합니다.

[스타일 데이터]
Word/HWP별 설정값을 따로 저장하지 않습니다.
파란논문.json의 동일한 스타일을 프로그램별 HTML로 변환합니다.
