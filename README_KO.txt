GitHub Pages용 로컬 PDF 폴더 테스트
===================================

이 샘플은 Chrome/Edge에서 사용자가 선택한 로컬 폴더의 PDF를
인터넷의 GitHub Pages 웹페이지가 읽을 수 있는지 확인합니다.
PDF 파일은 GitHub로 업로드되지 않습니다.

가장 쉬운 배포 순서
------------------
1. https://github.com 에 로그인
2. 오른쪽 위 + → New repository
3. Repository name 예: paper-pdf-test
4. Public 선택
5. Create repository
6. 저장소 화면에서 "uploading an existing file" 또는 Add file → Upload files
7. 이 ZIP을 먼저 압축 해제한 뒤, 아래 파일들을 전부 업로드
   - index.html
   - app.js
   - styles.css
   - manifest.webmanifest
   - .nojekyll
   - README_KO.txt
8. Commit changes
9. 저장소의 Settings → Pages
10. Build and deployment:
    Source = Deploy from a branch
    Branch = main
    Folder = /(root)
11. Save

잠시 뒤 주소는 보통 다음과 같습니다.
https://사용자이름.github.io/paper-pdf-test/

테스트
------
1. Chrome 또는 Edge로 GitHub Pages 주소 열기
2. [논문 폴더 선택]
3. PDF가 들어 있는 로컬 폴더 선택
4. 하위 폴더 PDF까지 목록에 나오는지 확인
5. [PDF 보기] 클릭
6. 다시 접속해서 [이전 폴더 다시 열기] 테스트

상대경로 테스트 예
-----------------
선택한 루트 폴더 내부:
  AI/kim2026.pdf

웹앱 입력:
  AI/kim2026.pdf

나중에 Google Sheets 링크는 대략:
  https://사용자이름.github.io/paper-pdf-test/?file=AI%2Fkim2026.pdf

주의
----
- ZIP 파일 자체를 GitHub 저장소에 올리는 것이 아니라 압축을 풀어 파일들을 올리세요.
- GitHub Pages 주소는 HTTPS라 File System Access API 테스트에 적합합니다.
- 브라우저가 로컬 폴더 권한을 다시 요구하는 경우가 있습니다.
