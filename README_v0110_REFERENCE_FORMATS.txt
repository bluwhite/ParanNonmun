파란 논문 v0.11.0 - 참고문헌 형식(out_set) 관리

교체/추가 파일
- shared.js
- index.html
- main.js
- styles.css
- paper-data/data-store.js
- paper-sheet/univer-sheet.js
- reference-format/format-manager.js   신규

이번 버전은 최종 참고문헌 출력 기능을 만들기 전 단계로,
기존 Excel의 out_set 역할을 파란 논문에 구현합니다.

상단 버튼
[논문 폴더 선택] [엑셀 가져오기] [참고문헌 형식] [다운로드 위치] [AI 설정]

처음 생성되는 기본 형식 6개
1. 학회지_국내
   AU(PY), 「TI」, 『JO』 VL+IS, PB, pp.SP-EP.

2. 학위_국내
   AU(PY), 「TI」, JO.

3. 단행본_국내
   AU(PY), 「TI」, JO.

4. 학회지_해외
   AU(PY), TI, JO VL+IS, SP-EP.
   이탤릭: JO

5. 학위_해외
   AU(PY), TI, JO.
   이탤릭: TI

6. 단행본_해외
   AU(PY), TI, JO.
   이탤릭: TI

사용 가능한 코드
AU      저자
PY      출판연도
TI      논문명
JO      학술지명
VL      권
IS      호
PB      학회명/발행기관
SP      시작페이지
EP      끝페이지
VL+IS   국내식 권·호 조합
VL(IS)  권(호) 조합

형식 관리 기능
- 형식 이름 수정
- 템플릿 직접 수정
- 코드 버튼으로 커서 위치에 코드 삽입
- 이탤릭 적용 코드 체크
- 새 형식 추가
- 기존 형식 복제
- 형식 삭제
- 중복 이름 방지
- 마지막 1개 형식은 삭제 불가

저장
- 파란논문.json의 referenceFormats 항목에 저장
- schemaVersion 4
- 기존 schemaVersion 3 파일은 열 때 자동으로 기본 형식 6개를 추가하여 마이그레이션
- 시트의 셀 편집 저장이 발생해도 referenceFormats가 사라지지 않도록
  Univer 내부 데이터에도 동기화

이번 버전에서는 아직 참고문헌 결과를 생성하거나 복사하지 않습니다.
다음 출력 기능이 이 referenceFormats 설정을 그대로 사용하게 됩니다.
