파란 논문 논문 추가 APA 패치
버전 번호 변경 없음.

파일 위치
- reference-data/journal-info.json
  저장소 루트의 reference-data 폴더 아래에 둡니다.

변경 파일
- main.js
- paper-add/index.html
- paper-add/add.js
- paper-add/add.css

새 파일
- reference-import/apa-parser.js
- reference-data/journal-info.json

기능
1. 논문 추가 팝업을 현재 파란 논문 창의 가로 중앙에 배치
2. 팝업 세로 위치는 현재 창 상단에서 약 10% 아래
3. 참고문헌 입력창 아래에 BR 줄바꿈 정리 / RIS / APA 버튼
4. 자동 RIS 분석 제거: 사용자가 RIS 또는 APA 버튼을 눌러 분석
5. APA에서 저자, 연도, 논문명, 학술지명, 권, 호, 페이지 추출
6. APA 학술지명을 journal-info.json에서 검색해 학회명 자동 입력
7. 동일 학술지에 학회 후보가 여러 개면 원본 순서의 첫 학회명을 적용하고 상태에 후보 수 표시
8. 확인(*) 항목은 논문 추가 화면에 표시하지 않고 저장 시 빈 값
