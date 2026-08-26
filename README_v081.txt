파란 논문 v0.8.1 — 동적 컬럼 패치

변경 파일만 포함합니다.
- shared.js
- index.html
- main.js
- styles.css
- paper-data/data-store.js

추가 기능
1. 논문 목록에 [열 추가] 버튼
2. 사용자가 원하는 열 이름으로 사용자 열 추가
3. 기존 열 이름과 중복되면 경고 후 추가하지 않음
   - 앞뒤 공백 제거
   - Unicode NFKC 정규화
   - 대소문자 무시
4. 열 제목을 마우스로 드래그해 순서 변경
5. 시스템 열과 사용자 열 모두 순서 이동 가능
6. 바꾼 열 순서를 파란논문.json에 즉시 저장
7. 사용자 열의 셀 값도 자동 저장
8. 기존 schemaVersion 1 데이터는 schemaVersion 2로 자동 변환
9. 기존 12개 논문 정보와 RIS 추가 기능은 그대로 유지

데이터 구조
- columns: 열 이름/순서/시스템 여부 저장
- papers: 기존 시스템 값 유지
- papers[].custom: 사용자가 만든 열의 값 저장

배포
ZIP 안의 파일만 기존 GitHub 저장소의 같은 위치에 덮어쓰고 Commit -> Push 하면 됩니다.
paper-add 폴더는 이번 패치에서 변경하지 않았습니다.
