논문 PDF 관리 v0.7.0

핵심 변경
- 복사본 저장 제거
- '원본에 저장' -> '저장'
- 저장은 항상 현재 원본 PDF를 갱신
- 읽기 모드: 편집 시작 + 확대/축소만 표시
- 편집 모드: 형광펜 / 메모 / 실행 취소 / 편집 취소 / 저장 표시
- 저장 완료 즉시 읽기 모드로 복귀
- PDF 편집 화면을 pdf-editor/ 폴더로 독립 분리
- 메모는 내용이 페이지 위 노란 상자로 같이 보임

프로젝트 구조
index.html          메인 목록
main.js             메인 목록 로직
styles.css          메인 화면 스타일
shared.js           버전 + 로컬 파일 핸들 공통 기능
pdf-editor/
  index.html        PDF 편집 화면
  editor.js         PDF 읽기/주석/저장 로직
  editor.css        PDF 편집 화면 스타일

배포
GitHub Desktop 또는 git으로 저장소를 한 번 clone한 뒤 파일을 덮어쓰고 Commit -> Push 하세요. GitHub Pages는 자동으로 갱신됩니다.
