/* 파란 논문 - 저자명 공통 정규화 */
(function(global){
  "use strict";

  const SEP="·";

  function clean(value){
    return String(value??"")
      .normalize("NFKC")
      .replace(/\u00a0/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function normalizeAuthors(value){
    let text=clean(value);
    if(!text)return "";

    text=text.replace(/\s*[•∙⋅・]\s*/g,SEP);

    text=text
      .replace(/\s*,?\s+and\s+/gi,SEP)
      .replace(/\s*,?\s*&\s*/g,SEP)
      .replace(/\s*;\s*/g,SEP);

    // APA: Smith, J., Doe, A. -> Smith, J.·Doe, A.
    text=text.replace(
      /((?:\b[A-ZÀ-ÖØ-Þ]\.\s*){1,5}),\s+(?=[A-ZÀ-ÖØ-Þ가-힣])/g,
      "$1"+SEP
    );

    // 한국어 이름: 김철수, 이영희 -> 김철수·이영희
    text=text.replace(/(?<=[가-힣]),\s*(?=[가-힣])/g,SEP);

    text=text
      .replace(/\s*,\s*·\s*/g,SEP)
      .replace(/\s*·\s*,\s*/g,SEP)
      .replace(/\s*·\s*/g,SEP)
      .replace(/·{2,}/g,SEP)
      .replace(/^·+|·+$/g,"")
      .trim();

    return text;
  }

  function joinAuthors(values){
    const result=[];

    for(const value of values||[]){
      const normalized=normalizeAuthors(value);
      if(!normalized)continue;

      for(const author of normalized.split(SEP)){
        const cleanAuthor=author.trim().replace(/^[,;]\s*|\s*[,;]$/g,"");
        if(cleanAuthor)result.push(cleanAuthor);
      }
    }

    return result.join(SEP);
  }

  global.ParanAuthorUtils=Object.freeze({
    separator:SEP,
    normalizeAuthors,
    joinAuthors
  });
})(typeof window!=="undefined" ? window : globalThis);
