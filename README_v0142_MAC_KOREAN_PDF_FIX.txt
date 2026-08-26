파란 논문 v0.14.2 - macOS 한글 PDF 파일명 대응

증상
- Windows에서는 PDF가 정상적으로 열림
- Mac에서도 영문 파일명 PDF는 열림
- Mac에서 한글 파일명 PDF만 찾지 못함

원인
Windows/웹 데이터에 저장된 한글 파일명과 macOS 파일시스템이
브라우저에 반환하는 한글 파일명의 Unicode 정규화 형태가 다를 수 있습니다.

대표적으로:
- NFC: 완성형 한글 코드포인트
- NFD: 초성/중성/종성 분해 형태

화면에는 동일하게 '한국어.pdf'로 보여도 JavaScript 문자열은
서로 다를 수 있습니다.

v0.14.2 수정

1. 참고문헌 목록의 PDF 값과 실제 폴더 PDF 비교
양쪽 파일명/경로를:
  normalize("NFC").toLocaleLowerCase()
로 바꾼 뒤 비교합니다.

따라서:
  NFC 한국어.pdf
  NFD 한국어.pdf
를 같은 파일명으로 처리합니다.

2. 실제 PDF 파일 열기(resolveFile)
기존의 빠른 검색을 먼저 사용합니다:
  dir.getFileHandle(fileName)

정확한 이름으로 찾으면 즉시 사용합니다.

NotFoundError가 발생한 경우에만 해당 폴더의 실제 파일들을 순회하면서:
  actualName.normalize("NFC")
  requestedName.normalize("NFC")
를 비교해 일치하는 FileSystemFileHandle을 찾습니다.

하위 폴더 이름도 같은 방식으로 처리합니다.

3. 성능
영문 파일명 및 파일명이 정확히 일치하는 일반적인 경우에는
기존 getFileHandle/getDirectoryHandle 한 번으로 끝납니다.

폴더 순회 fallback은 정확한 파일명 검색이 실패했을 때만 수행합니다.

4. 기존 기능
PDF 연결, PDF 메모 검색, PDF 편집기, Windows 동작 등은 그대로 유지합니다.
