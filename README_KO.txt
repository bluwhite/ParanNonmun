GitHub Pages용 PDF 연속 스크롤 + 표준 주석 테스트

업데이트 내용
-------------
- 페이지 넘김 방식 -> 세로 연속 스크롤
- 형광펜 -> 표준 PDF Highlight annotation
- 메모 -> 표준 PDF Text annotation
- 원본에 저장 / 복사본 저장 유지
- 긴 PDF를 위해 화면 근처 페이지만 렌더링(lazy rendering)

배포
----
기존 GitHub Pages 저장소라면 ZIP을 풀어 파일 전체를 덮어 업로드하고 Commit changes만 하세요.
Pages 설정은 다시 할 필요 없습니다.

업데이트 후:
Windows Chrome/Edge: Ctrl+F5
Mac Chrome/Edge: Cmd+Shift+R

테스트
------
1. 논문 폴더 선택
2. PDF에서 [연속 스크롤로 열기]
3. 아래로 스크롤되는지 확인
4. 형광펜: 드래그
5. 메모: [메모] -> 메모 내용 입력 -> 페이지 클릭
6. [원본에 저장]
7. 같은 PDF를 다시 열어 주석이 보이는지 확인
8. Acrobat/Edge/Chrome 등 다른 PDF 뷰어에서 표준 주석으로 인식되는지 확인

주의
----
이번 버전은 표준 PDF annotation 객체를 직접 생성하는 테스트 버전입니다.
PDF 뷰어별로 주석의 아이콘/색/표시 방식이 조금 다를 수 있습니다.
형광펜은 현재 텍스트 선택 기반이 아니라 사용자가 드래그한 직사각형 영역을 Highlight QuadPoints로 저장합니다.
