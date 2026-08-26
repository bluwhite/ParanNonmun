파란 논문 v0.10.3 - AI 발행기관/대학 파싱

교체 파일
- shared.js
- reference-import/ai-parser.js

변경 내용
AI 반환 필드에 publisher를 추가했습니다.

예:
Hong, Q. N., Pluye, P., Fàbregues, S., Bartlett, G., Boardman, F., Cargo, M., & Vedel, I. (2018). Mixed methods appraisal tool (MMAT) version 2018. McGill University.

예상 결과
- 저자: Hong, Q. N.·Pluye, P.·Fàbregues, S.·Bartlett, G.·Boardman, F.·Cargo, M.·Vedel, I.
- 출판연도: 2018
- 논문명: Mixed methods appraisal tool (MMAT) version 2018
- 학술지명: 빈 값
- 학회명: McGill University
- 권/호/페이지: 빈 값

판단 규칙
- journal: 학술지/정기간행물/프로시딩 명칭
- publisher: 대학, 연구소, 정부기관, 학회, 출판사 등 발행기관
- 보고서/매뉴얼/가이드라인/기관 문서처럼 학술지가 없는 독립 자료는
  journal을 비우고 publisher에 발행기관을 넣음
- publisher가 명시되지 않은 경우 추측하지 않음

현재 파란 논문의 기존 데이터 구조에서는 publisher 값이 '학회명' 열에 표시됩니다.
