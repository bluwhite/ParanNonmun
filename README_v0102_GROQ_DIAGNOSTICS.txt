파란 논문 v0.10.2 - Groq 오류 상세 진단

교체 파일
- shared.js
- reference-import/ai-parser.js
- paper-add/index.html
- paper-add/add.js
- paper-add/add.css

이 버전은 원인을 단정하지 않고 Groq가 반환한 상세 정보를 확인하기 위한 진단 기능을 추가합니다.

표시 항목
- model
- HTTP status
- error.type
- error.code
- request id (응답에 있는 경우)
- error.message
- error.failed_generation
- HTTP 200이지만 JSON.parse 실패 시 실제 generated content

Qwen 실패 후 GPT-OSS Strict fallback이 성공해도
'Qwen JSON 실패 → Strict fallback 성공' 문구와 함께
'AI 오류 상세 보기'에서 Qwen의 실제 실패 내용을 볼 수 있습니다.

두 모델 모두 실패하면 양쪽 오류를 모두 표시합니다.
'오류 상세 복사' 버튼으로 내용을 복사할 수 있습니다.

Groq API Key는 진단 정보에 포함하지 않습니다.
