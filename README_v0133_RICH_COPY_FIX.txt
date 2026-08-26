파란 논문 v0.13.3 - Word/아래한글 서식 포함 복사 수정

핵심 수정 1: 내어쓰기 계산 오류
기존 v0.13.2에서는 왼쪽 여백 6pt, 내어쓰기 30pt일 때
내어쓰기를 왼쪽 여백보다 크게 적용하지 않도록 잘라서 실제로 6pt만 적용했습니다.

수정:
- 아래한글 왼쪽 여백: 6pt
- 내어쓰기: 30pt

CSS 변환:
- margin-left: 36pt
- text-indent: -30pt

따라서:
- 첫 줄 시작 위치 = 6pt
- 둘째 줄 이후 시작 위치 = 36pt

이 방식이 hanging indent의 올바른 변환입니다.

핵심 수정 2: 서식 포함 복사 방식
기존:
- HTTPS 앱에서는 ClipboardItem(text/html)이 우선 실행됨
- Word/아래한글에서 이탤릭은 유지되지만 글꼴/문단 CSS는 잘 반영되지 않는 현상

v0.13.3:
- 실제 렌더링된 숨은 DOM을 생성
- 글자 서식은 별도 span에 명시
- 문단 서식은 div에 명시
- DOM 전체를 Range로 실제 선택
- document.execCommand("copy") native rich-copy를 우선 사용
- native copy가 실패할 때만 ClipboardItem 방식으로 fallback

글자 서식:
- 글꼴
- 크기
- 장평
- 자간

문단 서식:
- 왼쪽 여백
- 오른쪽 여백
- 내어쓰기
- 줄간격
- 문단 위/아래
- 정렬

붙여넣기:
- Word: Ctrl+V
- 아래한글: 반드시 Ctrl+Alt+V -> 인터넷 문서
