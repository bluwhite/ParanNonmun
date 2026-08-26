파란 논문 v0.10.6 - 기본 Downloads 폴더 선택 오류 수정

문제
Chrome/Edge는 Windows의 기본 Downloads/Documents 같은 민감한 상위 폴더를
showDirectoryPicker()로 열지 못하게 막을 수 있습니다.
그래서 v0.10.5의 '다운로드 폴더' 지정은 기본 Downloads에서
'시스템 파일이 포함되어 있어 선택할 수 없음' 오류가 발생할 수 있습니다.

변경
- 다운로드 폴더 전체에 대한 권한을 더 이상 요구하지 않습니다.
- 버튼 이름을 '다운로드 위치'로 변경했습니다.
- PDF 선택창은 기본 Downloads에서 시작합니다.
- 같은 picker id를 사용하므로 브라우저가 최근 선택한 위치를 기억합니다.
- '다운로드 위치' 버튼에서는 PDF 하나를 선택해 위치만 기억하며,
  선택한 파일 자체는 변경하지 않습니다.

PDF 연결
- 선택 행의 논문명 확인
- PDF 파일만 선택
- 논문 폴더에 논문명으로 복사/이름 변경
- PDF 열에 확장자를 제외한 파일명 기록
- 이후 선택한 파일 handle의 remove()로 원본 삭제를 시도
- 브라우저가 원본 삭제를 지원하지 않거나 권한을 주지 않으면
  연결은 정상 완료하고 원본만 남겼다는 경고를 표시

교체 파일
- shared.js
- index.html
- main.js
- styles.css
- paper-sheet/univer-sheet.js
- pdf-link/pdf-link.js
