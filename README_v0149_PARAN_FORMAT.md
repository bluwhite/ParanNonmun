# v0.14.9 — 파란 형식 PARAN 1
논문 추가 화면에 영문저자(authorsEn), 영문제목(titleEn), 영문학술지명(journalEn), DOI(doi) 선택 입력을 추가했습니다.
기존 RIS/BibTeX/APA/MLA/AI 분석 경로는 유지됩니다.

- `파란 형식 분석`: 같은 입력창의 PARAN 1을 해석해 미리보기에 표시합니다. 확인 후 목록에 추가합니다.
- `파란 형식 복사`: 현재 미리보기 값을 PARAN 1로 복사합니다.
- `AI 검색 요청문 복사`: ChatGPT 등에 전달할 검색·출력 지침을 복사합니다.
- 새 폴더에는 선택 열 네 개가 기본 포함됩니다. 기존 목록의 열은 자동 추가하지 않습니다.
- 기존 목록에서 새 값을 받으려면 `영문저자`, `영문제목`, `영문학술지명`, `DOI` 이름의 열을 추가하세요.
- 대상 열이 없거나 입력값이 없으면 새 선택값은 전달하지 않습니다. 기존 파일도 계속 열 수 있습니다.

## 규격
UTF-8 텍스트, 한 번에 한 논문. 시작 `PARAN  - 1`, 종료 `ER  -`.
태그 뒤 값은 한 줄. TI(논문명)는 필수이며 나머지는 생략 가능.
AU 저자 / PY 연도 / TI 논문명 / JO 학술지 / VL 권 / IS 호 / PB 학회 / SP 시작쪽 / EP 끝쪽 / EA 영문저자 / ET 영문제목 / EJ 영문학술지 / DO DOI / N1 메모 / L1 PDF 파일명.
AU와 EA를 반복하면 저자를 순서대로 연결합니다. 알 수 없는 태그는 무시합니다. DOI는 확인된 값을 그대로 사용합니다.

```text
PARAN  - 1
AU  - 이종원
PY  - 2008
TI  - ‘맞은편’은 어디인가? 공간언어의 모호성과 의사소통 문제
JO  - 대한지리학회지
VL  - 43
IS  - 1
PB  - 대한지리학회
SP  - 71
EP  - 86
EA  - Jongwon Lee
ET  - Which Direction Is the Opposite Side? The Ambiguity of Spatial Language and Communication Problems
EJ  - Journal of the Korean Geographical Society
DO  - 10.22776/kgs.2008.43.1.71
ER  -
```
