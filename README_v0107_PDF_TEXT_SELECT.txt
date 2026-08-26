파란 논문 v0.10.7 - 행 더블클릭 PDF 열기 + PDF 텍스트 선택

교체 파일
- shared.js
- paper-sheet/univer-sheet.js
- pdf-editor/editor.js
- pdf-editor/editor.css
- pdf-editor/index.html

[시트]
- 데이터 행의 어느 컬럼/셀을 더블클릭해도 그 행의 PDF를 엽니다.
- PDF 열뿐 아니라 저자, 연도, 논문명, 학술지명, 메모 등 어느 셀이든 작동합니다.
- 헤더 행은 제외합니다.

[PDF 읽기 모드]
- PDF.js text layer를 페이지 canvas 위에 추가했습니다.
- 실제 텍스트가 포함된 PDF는 마우스로 드래그 선택 가능합니다.
- Ctrl+C, 우클릭 복사 등을 사용할 수 있습니다.
- 선택 영역은 파란색 반투명으로 표시됩니다.

[PDF 편집 모드]
- 편집 시작을 누르면 text layer의 선택 기능을 잠급니다.
- 기존 형광펜/메모용 overlay가 우선 작동합니다.
- 저장/편집 취소 후 읽기 모드로 돌아가면 다시 선택/복사가 가능합니다.

[확대/축소]
- 페이지를 다시 렌더링할 때 text layer도 함께 다시 생성됩니다.

[제한]
- 스캔 이미지로만 된 PDF처럼 내부에 텍스트 정보가 없는 문서는
  OCR 없이는 선택/복사할 수 없습니다.
