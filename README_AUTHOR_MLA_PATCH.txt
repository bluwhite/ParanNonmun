파란 논문 참고문헌 가져오기 패치
버전 번호 변경 없음.

변경/추가 파일:
- paper-add/index.html
- paper-add/add.js
- paper-add/add.css
- reference-import/author-utils.js   (신규)
- reference-import/ris-parser.js
- reference-import/apa-parser.js
- reference-import/mla-parser.js     (신규)

journal-info.json:
- 기존 위치 그대로 유지: reference-data/journal-info.json
- 이번 ZIP에는 변경이 없어서 포함하지 않음

저자 규칙:
- 저자가 여러 명이면 항상 '·'로 구분
- ' and ', ', and ', '&'는 '·'로 변환
- RIS의 반복 AU/A1도 '·'로 연결
- 한국어 저자의 쉼표 나열도 가능한 경우 '·'로 변환
- Smith, John 같은 한 사람 이름 내부 쉼표는 유지

MLA:
- 학술지 논문 형식을 우선 지원
- 따옴표 안 논문명 추출
- 학술지명, vol., no., 연도, pp. 추출
- reference-data/journal-info.json에서 학회명 보완
