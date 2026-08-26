파란 논문 v0.13.8 - 아래한글 왼쪽 여백 변환 공식 확정

사용자 테스트 결과

목표:
- 왼쪽 여백 6pt
- 내어쓰기 30pt

테스트 A
CSS:
  margin-left:36pt
  text-indent:-30pt
한글 결과:
  왼쪽 -24pt
  내어쓰기 30pt

테스트 B
CSS:
  margin-left:66pt
  text-indent:-30pt
한글 결과:
  왼쪽 6pt
  내어쓰기 30pt

따라서 v0.13.8부터 아래한글용 변환 공식은:

  hwpMarginLeft =
      설정한 왼쪽 여백
      + (설정한 내어쓰기 × 2)

으로 계산합니다.

기본값 예:
  왼쪽 여백 = 6pt
  내어쓰기 = 30pt

  hwpMarginLeft = 6 + (30 × 2)
                = 66pt

중요:
66pt를 하드코딩하지 않습니다.

예를 들어 사용자가:
  왼쪽 여백 = 10pt
  내어쓰기 = 20pt

로 설정하면 자동으로:
  10 + (20 × 2) = 50pt

를 아래한글용 HTML에 사용합니다.

Word용 변환은 기존과 별개로 유지:
  wordParagraphLeft =
      왼쪽 여백 + 내어쓰기

줄간격/내어쓰기/이탤릭 등 v0.13.7에서 정상 동작한
아래한글 HStyle HTML 구조는 그대로 유지합니다.
