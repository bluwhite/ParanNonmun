파란 논문 v0.13.9 - 이탤릭 앞뒤 공백 보존

문제 예:
  AU(PY), TI, <이탤릭>JO</이탤릭> VL+IS, SP-EP.

템플릿 화면에서는 JO 앞뒤에 공백이 있어도
실제 참고문헌 출력에서 다음처럼 붙는 현상:
  ... TI,Journal Name제12권 ...

원인:
contenteditable과 HTML sanitizer 사이에서 inline <em> 태그 경계의
일반 공백이 재직렬화 과정에서 사라질 수 있었음.

수정:
이탤릭 바로 앞/뒤의 의도적인 한 칸 공백을 &nbsp;로 보존합니다.

예:
  AU(PY), TI, <em>JO</em> VL+IS
저장:
  AU(PY), TI,&nbsp;<em>JO</em>&nbsp;VL+IS

화면과 출력에서는 일반 한 칸처럼 보입니다.

기존 파란논문.json에도 적용:
기존 템플릿에
  " <em>"
  "</em> "
형태의 일반 공백이 저장되어 있으면,
양식을 읽어 normalize할 때 자동으로 &nbsp; 경계 공백으로 바뀝니다.

Word/아래한글 복사:
&nbsp;는 HTML Format에서 공백으로 유지되므로
이탤릭 학술지명 앞뒤 간격도 함께 보존됩니다.
