파란 논문 v0.13.4 - 서식 포함 복사 회귀 수정

문제
v0.13.3에서 숨은(off-screen) DOM을 만들어 native copy를 수행했더니,
일부 브라우저에서 Windows 클립보드의 HTML Format이 만들어지지 않아
아래한글 Ctrl+Alt+V에 '인터넷 문서'가 나타나지 않고
일반 텍스트만 붙는 회귀가 발생했습니다.
이탤릭도 함께 사라졌습니다.

수정
독립 테스트 HTML에서 실제로 성공했던 방식과 동일하게 변경했습니다.

- 숨은 DOM 생성 안 함
- 현재 화면에 실제 보이는 참고문헌 출력 영역을 직접 Range로 선택
- document.execCommand("copy") 실행
- 복사 후 사용자의 원래 선택 영역 복원
- native copy가 실패하는 경우에만 ClipboardItem(text/html + text/plain) fallback

즉, 테스트 페이지의 성공했던 fallback 방식과 동일한 복사 경로입니다.

기존 v0.13.3의 내어쓰기 변환 수정은 유지:
- 아래한글 왼쪽 여백 6pt + 내어쓰기 30pt
- CSS margin-left 36pt / text-indent -30pt

사용
- Word: 서식 포함 복사 -> Ctrl+V
- 아래한글: 서식 포함 복사 -> Ctrl+Alt+V -> 인터넷 문서
