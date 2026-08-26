파란 논문 v0.12.3 - 아래한글 HTML Format(copy event) 테스트

이번 버전에서는 [한글용 복사]만 실험 방식으로 변경했습니다.

기존에 테스트한 방식
- ClipboardItem(text/html + text/plain)
- 실제 DOM 선택 후 native copy
- 숨은 1×1 HTML table native copy

v0.12.3 방식
1. 참고문헌 출력 결과에서 이탤릭 부분을 모두 <i>...</i>로 변환
2. HTML 전체를 다음과 같이 구성
   <html>
   <body>
   <!--StartFragment-->
   ... <i>Journal Name</i> ...
   <!--EndFragment-->
   </body>
   </html>
3. 사용자가 [한글용 복사]를 누르면 document.execCommand("copy") 실행
4. 실제 copy 이벤트를 capture 단계에서 가로챔
5. event.clipboardData.setData("text/html", html)
6. event.clipboardData.setData("text/plain", plain)
7. event.preventDefault()

즉 navigator.clipboard.write(ClipboardItem)를 거치지 않고
브라우저의 실제 copy 이벤트 경로에서 text/html을 직접 등록합니다.

테스트 목적
Windows 브라우저가 이 text/html 데이터를 시스템 클립보드의
CF_HTML ("HTML Format") 형태로 변환해 아래한글이 이탤릭을 읽는지 확인합니다.

주의
웹 JavaScript에서는 Windows API의 RegisterClipboardFormat("HTML Format")을
직접 호출할 수 없습니다.
따라서 이 버전은 브라우저가 native clipboard로 변환하는 경로를 이용한 테스트입니다.

교체 파일
- shared.js
- index.html
- reference-output/output.js
