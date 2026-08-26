파란 논문 v0.12.2 - 아래한글용 Excel 유사 표 복사

핵심 변경
- 화면의 참고문헌 결과는 여전히 일반 문단 형태입니다.
- [한글용 복사]를 누를 때만 화면 밖에 숨은 1×1 HTML 표를 만듭니다.
- 표의 단 하나의 셀 안에 모든 참고문헌을 문단으로 넣습니다.
- 이탤릭 구간은 <em>/<i>에 의존하지 않고
  <span style="font-style: italic">...</span> 형태로 명시합니다.
- 숨은 표 자체를 Range로 선택하고 document.execCommand("copy")로
  브라우저 native rich copy를 실행합니다.

목적
Excel에서 셀을 복사해 아래한글에 붙이면 이탤릭이 유지되는 사용자 환경을
브라우저에서 최대한 비슷하게 재현하기 위한 방식입니다.

왜 1×1 표인가
- Excel처럼 표/셀 기반의 rich clipboard 구조를 만들기 위함
- 여러 참고문헌을 여러 행의 표로 만들지 않고
  하나의 셀 안에 문단으로 넣어서
  아래한글에서 붙여넣은 뒤 여러 셀을 병합해야 하는 불편을 줄이기 위함

버튼
- 일반 텍스트 복사
- 한글용 복사 : 1×1 Excel 유사 표/native copy
- Word용 서식 복사 : ClipboardItem text/html + text/plain

주의
브라우저가 실제 Excel의 전용 Windows/Office 클립보드 형식까지 생성할 수는 없으므로
이번 방식은 'HTML table을 native copy'하여 아래한글의 표 기반 서식 인식을
유도하는 호환성 실험입니다.
