파란 논문 v0.11.1 - 참고문헌 양식 그룹(out_set) 재설계

교체 파일
- shared.js
- index.html
- main.js
- styles.css
- paper-data/data-store.js
- paper-sheet/univer-sheet.js
- reference-format/format-manager.js

핵심 변경
1. 참고문헌 양식은 별도 JSON이 아니라 기존 '파란논문.json' 안에 저장합니다.
2. 저장 키는 referenceFormatGroups 입니다.
3. 양식 정보가 없는 기존 JSON을 열면 기본 3개 그룹을 자동 추가하고
   파란논문.json에 다시 저장합니다.
4. schemaVersion은 5입니다.

기본 그룹
- 경사대양식
- 양식1
- 양식2

기본값은 기존 Excel 참고문헌_0825.xlsm의 out_set 아래쪽
27~32행 / 34~39행 / 41~46행을 기준으로 옮겼습니다.

그룹 구조
각 그룹에는 항상 아래 6개 형식이 있습니다.
- 학회지_국내
- 학위_국내
- 단행본_국내
- 학회지_해외
- 학위_해외
- 단행본_해외

양식 관리 화면
- 왼쪽: 양식 그룹 목록
- 그룹 추가
- 그룹 복제
- 그룹 삭제
- 그룹 이름 수정
- 오른쪽: 선택 그룹의 6개 템플릿을 한 화면에서 수정
- 별도의 '코드 삽입' / '이탤릭 항목 선택' 기능은 제거

이탤릭
- 템플릿 자체에서 직접 관리합니다.
- 텍스트를 선택하고 Ctrl+I (Mac은 Cmd+I)를 누르면 이탤릭 적용/해제
- 저장 시 템플릿 HTML 안에 <em>...</em>으로 보존
- 예: AU(PY), TI, <em>JO</em> VL+IS, SP-EP.
- 향후 참고문헌 출력 기능은 이 서식을 그대로 읽어 최종 결과에 반영합니다.

JSON 예
"referenceFormatGroups": [
  {
    "id": "format-group-kyunghee",
    "name": "경사대양식",
    "formats": {
      "journalKo": "AU(PY), 「TI」, 『JO』 VL+IS, PB, pp.SP-EP.",
      "journalEn": "AU(PY), TI, <em>JO</em> VL+IS, SP-EP."
    }
  }
]

새 논문 시작
기존에 사용하던 파란논문.json을 새 논문 폴더에 복사해서 시작하면
사용자가 수정하거나 추가한 양식 그룹도 함께 재사용됩니다.

템플릿 코드 안내
AU 저자
PY 출판연도
TI 논문명
JO 학술지명
VL 권
IS 호
PB 학회명/발행기관
SP 시작페이지
EP 끝페이지
VL+IS 국내식 권·호
VL(IS) 권(호)
VL/IS 권/호
