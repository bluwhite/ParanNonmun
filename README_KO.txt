GitHub Pages용 PDF 메모·형광펜 저장 테스트
==========================================

무엇을 테스트하나
----------------
- Chrome/Edge에서 로컬 PDF 폴더 선택
- PDF를 웹앱 안에서 페이지별로 표시
- 마우스 드래그로 형광 표시
- 한국어 메모를 입력하고 페이지 위치를 클릭해 메모 박스 추가
- 원본 PDF는 그대로 두고 같은 폴더에 *_annotated.pdf 파일로 저장

중요
----
PDF는 GitHub에 업로드하지 않습니다.
GitHub Pages는 HTML/CSS/JavaScript 프로그램 파일만 제공합니다.
실제 PDF 읽기/수정/저장은 사용자의 브라우저와 로컬 파일 시스템 사이에서 이루어집니다.

GitHub Pages 배포
-----------------
1. GitHub에서 Public 저장소를 하나 만듭니다. 예: pdf-annotation-test
2. 이 ZIP을 압축 해제합니다.
3. index.html, app.js, styles.css, .nojekyll, README_KO.txt를 저장소 루트에 업로드합니다.
4. Settings → Pages
5. Source = Deploy from a branch
6. Branch = main, Folder = /(root)
7. Save
8. 생성된 https://사용자이름.github.io/pdf-annotation-test/ 주소를 Chrome/Edge에서 엽니다.

테스트 순서
-----------
1. [논문 폴더 선택]
2. PDF가 들어 있는 폴더 선택
3. PDF 목록에서 [편집]
4. 형광펜: PDF 위에서 마우스로 영역 드래그
5. 메모: [메모] 클릭 → 메모 내용 입력 → PDF에서 위치 클릭
6. [수정본 새 파일로 저장]
7. 원본과 같은 폴더에 원본파일명_annotated.pdf 생성 확인
8. 생성 파일을 Chrome/Acrobat/Preview에서 열어 표시 확인

주의
----
- 이 샘플의 형광/메모는 PDF 표준 주석 객체가 아니라 페이지 위에 그래픽으로 그려 넣는 방식입니다.
- 따라서 저장된 표시는 다른 PDF 뷰어에서도 보입니다.
- 원본 PDF를 덮어쓰지 않습니다.
- pdf.js와 pdf-lib를 CDN에서 불러오므로 인터넷 연결이 필요합니다.
