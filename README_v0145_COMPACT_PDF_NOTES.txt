파란 논문 v0.14.5 - PDF 메모 표시 개선

기존 큰 노란 메모 박스를 제거하고 메모 위치에 작은 18px 표시만 보여줍니다.

동작:
- 마우스 hover: 메모 내용 tooltip
- 키보드 focus: 메모 내용 tooltip
- 클릭: tooltip 고정/해제
- 다른 곳 클릭 또는 Esc: 고정 해제
- 오른쪽/아래쪽 메모는 tooltip 방향 자동 보정
- 저장 전 새 메모는 점선 표시
- 확대/축소 시 위치는 따라가되 아이콘 크기는 18px로 유지

PDF 데이터 형식은 그대로 유지:
- /Subtype /Text
- /Contents
- /Name /Comment

따라서 기존에 저장한 메모도 그대로 표시됩니다.
형광펜 저장 방식도 변경하지 않았습니다.

수정 파일:
- shared.js
- pdf-editor/editor.js
- pdf-editor/editor.css

메인 index.html은 수정하지 않았습니다.
