파란 논문 v0.10.0 - Groq AI 참고문헌 파싱

변경 파일
- shared.js
- index.html
- main.js
- styles.css
- ai-config/credential-store.js
- reference-import/ai-parser.js
- paper-add/index.html
- paper-add/add.js
- paper-add/add.css

사용 방법
1. 기존 파란 논문 파일에 위 파일을 같은 위치로 덮어씁니다.
2. 논문 폴더를 선택합니다.
3. 메인 화면의 작은 'AI 설정' 버튼을 누릅니다.
4. 발급받은 Groq API Key(gsk_...)를 입력하고 저장합니다.
5. 논문 추가 화면에서 'AI 분석'을 누릅니다.

AI 분석 버튼 순서
[AI 분석] [RIS] [APA] [MLA]
- AI가 가장 앞에 위치
- APA가 primary 메인 버튼
- 기존 RIS/APA/MLA 기능 유지

AI 모델
- qwen/qwen3.6-27b
- Groq Chat Completions API 직접 호출
- JSON Object Mode 사용
- APA/MLA/Chicago/Harvard/Vancouver/IEEE/한국 DB 및 사이트 변형 형식을 AI가 스스로 판단

보안
- Groq API Key는 파란논문_ai.json에 평문으로 저장되지 않음
- AES-GCM 암호화
- 복호화 CryptoKey는 extractable:false로 현재 브라우저 IndexedDB에 저장
- 저장 당시 논문 폴더의 FileSystemDirectoryHandle과 함께 묶음
- 파란논문_ai.json만 다른 PC/브라우저/폴더로 복사하면 사용 불가
- 단, AI 호출 순간에는 브라우저가 사용자의 Groq API Key를 사용하므로 브라우저 환경에서 키를 절대적으로 숨기는 구조는 아님

이전 Cloudflare AI 프로토타입의 파란논문_ai.json이 있으면 AI 설정에서 Groq API Key를 다시 저장하면 새 형식으로 교체됩니다.
