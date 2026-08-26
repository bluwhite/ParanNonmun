파란 논문 v0.13.6 - Word / 아래한글 문단 매핑 보정

사용자 테스트 결과
1. Word
- Left: 0.08" ≈ 6pt
- Hanging: 0.42" ≈ 30pt
- Before: 0
- After: 0
- Justified
→ 들여쓰기/문단 앞뒤 간격은 정상적으로 들어감
- 문제: Line spacing이 Single로 들어감

2. 아래한글
- 이탤릭과 내어쓰기는 들어감
- 왼쪽 여백/줄간격이 기대대로 들어가지 않음
- 맨 처음 빈 줄 하나 발생

v0.13.6 수정

[아래한글용]
복사 경로를 native 화면 selection 방식에서
copy 이벤트의 text/html 직접 등록 방식으로 변경했습니다.

HTML은 불필요한 출력창 wrapper 없이:
<div style="...">참고문헌 1</div>
<div style="...">참고문헌 2</div>
형태만 생성합니다.

따라서 첫 빈 줄의 원인이 될 수 있는 referenceOutputArea와 카드 구조를
클립보드 HTML에서 완전히 제외합니다.

아래한글 문단 매핑:
- 왼쪽 여백: CSS margin-left = 설정값 그대로 6pt
- 내어쓰기: CSS text-indent = -30pt
- 오른쪽 여백: margin-right
- 줄간격: 180%를 10pt × 1.8 = 18pt의 고정 line-height로 전달
- 정렬: justify
- 글꼴: HCR Dotum + 함초롬돋움 alias
- 이탤릭: <i>

붙여넣기:
Ctrl+Alt+V -> 인터넷 문서

[Word용]
Word 화면에서 이미 6pt / Hanging 30pt가 정상으로 잡혔으므로
들여쓰기 변환은 유지합니다.

줄간격만:
- 10pt, 180% -> line-height:18pt
- mso-line-height-rule:exactly
로 변경합니다.

따라서 Word 문단 설정에서는 Single 대신
Exactly 18pt에 해당하는 형태로 들어가는 것을 목표로 합니다.

Word 글꼴에도:
- font-family
- mso-fareast-font-family
- mso-ascii-font-family
- mso-hansi-font-family
를 함께 지정합니다.
