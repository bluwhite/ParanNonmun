파란 논문 v0.13.7 - 아래한글 HStyle HTML 보정

사용자 확인 결과(v0.13.6)
- 정렬: 양쪽 -> 정상
- 오른쪽: 0 -> 정상
- 문단 위/아래: 0 -> 정상
- 내어쓰기: 30pt -> 정상
- 왼쪽: -24pt -> 잘못됨
- 줄간격: 글자에 따라 120% -> 잘못됨

1. 왼쪽 여백 계산 확정

v0.13.6에서:
CSS
  margin-left: 6pt
  text-indent: -30pt

아래한글 결과:
  왼쪽: -24pt
  내어쓰기: 30pt

즉 아래한글은 실질적으로 첫 줄 시작점을
margin-left + text-indent로 해석합니다.

목표:
  왼쪽 6pt
  내어쓰기 30pt

따라서 HTML:
  margin-left: 36pt
  text-indent: -30pt

으로 수정합니다.

2. 줄간격

v0.13.6의 line-height:18pt는 아래한글 인터넷 문서 붙여넣기에서 무시되어
기본값 '글자에 따라 120%'로 들어갔습니다.

v0.13.7에서는 한컴이 자체 HTML에서 사용하는 형태를 따라갑니다.

<p class="HStyle0"
   style="
     margin-left:36pt;
     text-indent:-30pt;
     line-height:180%;
     mso-pagination:none;
     mso-padding-alt:0pt 0pt 0pt 0pt;
   ">
  <span style="
     position:relative;
     font-size:10pt;
     font-family:'HCR Dotum';
     line-height:180%;
     mso-font-width:100%;
     letter-spacing:0;
  ">
    참고문헌...
  </span>
</p>

핵심:
- p에 line-height:180%
- span에도 line-height:180%
- class="HStyle0"
- mso-padding-alt
- mso-pagination:none

3. 첫 빈줄
추가 빈 p나 wrapper 문단을 만들지 않습니다.
StartFragment 안에는 실제 참고문헌 p만 연속으로 들어갑니다.

4. Word
v0.13.6의 Word용 복사 로직은 변경하지 않았습니다.
