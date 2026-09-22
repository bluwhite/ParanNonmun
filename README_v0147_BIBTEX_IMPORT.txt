파란 논문 v0.14.7 - BibTeX 단일 항목 가져오기

논문 추가 화면에 BibTeX 규칙 기반 분석을 추가했습니다.

- 논문 추가 화면에 BibTeX 버튼 추가
- 한 번에 BibTeX 한 항목만 분석
- 지원 유형:
  article, book, inbook, incollection, inproceedings, conference,
  proceedings, mastersthesis, phdthesis, techreport, misc, unpublished
- 변환 필드:
  author -> 저자
  year/date -> 출판연도
  title -> 논문명
  journal/booktitle -> 학술지명
  volume -> 권
  number/issue -> 호
  publisher/school/institution/organization -> 학회명/발행기관
  pages -> 시작페이지/끝페이지
  note + DOI + URL -> 메모
  file/localfile -> PDF 파일명
- BibTeX 저자의 "and" 구분을 파란논문의 중간점(·) 구분으로 변환
- mastersthesis/phdthesis는 학술지명이 없을 때 석사학위논문/박사학위논문으로 표시
- 여러 BibTeX 항목을 한 번에 붙여 넣으면 오류 안내
