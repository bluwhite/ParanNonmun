/* PARAN 1: one paper per record; optional tags are omitted when unknown. */
(function(global){
  "use strict";
  const fields={AU:"authors",PY:"year",TI:"title",JO:"journal",VL:"volume",IS:"issue",PB:"publisher",SP:"startPage",EP:"endPage",EA:"authorsEn",ET:"titleEn",EJ:"journalEn",DO:"doi",N1:"memo",L1:"pdf"};
  function clean(value){return String(value??"").replace(/[\r\n]+/g," ").trim();}
  function parse(text){
    const lines=String(text??"").replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").trim().replace(/^```[^\n]*\n/,"").replace(/\n```\s*$/,"").split("\n");
    if(!/^PARAN\s*-\s*1\s*$/.test(lines.shift()||""))throw new Error("파란 형식은 PARAN  - 1로 시작해야 합니다.");
    const result={};let ended=false;
    for(const line of lines){
      if(!line.trim())continue;
      if(ended)throw new Error("한 번에 논문 한 편만 입력하세요.");
      const match=line.match(/^([A-Z][A-Z0-9])\s*-\s?(.*)$/);
      if(!match)throw new Error("태그 형식을 확인하세요: "+line);
      const [,tag,raw]=match;
      if(tag==="ER"){ended=true;continue;}
      if(!fields[tag])continue; // forward-compatible unknown tags
      const value=clean(raw);if(!value)continue;
      const field=fields[tag];
      if((tag==="AU"||tag==="EA") && result[field])result[field]+="·"+value;
      else result[field]=value;
    }
    if(!ended)throw new Error("마지막에 ER  - 를 넣으세요.");
    if(!result.title)throw new Error("논문명(TI)이 필요합니다.");
    return result;
  }
  function stringify(record){
    if(!clean(record?.title))throw new Error("논문명을 입력하세요.");
    const lines=["PARAN  - 1"];
    for(const [tag,field] of Object.entries(fields)){
      const value=clean(record[field]);if(value)lines.push(tag+"  - "+value);
    }
    lines.push("ER  -");return lines.join("\n");
  }
  const prompt=`다음 논문의 국문·영문 서지정보와 DOI를 KCI와 학술지 공식 사이트에서 확인하세요. 임의 번역·로마자 변환·추측을 하지 마세요. 결과는 논문 한 편당 다음 파란 형식(PARAN 1) 코드 블록으로 출력하세요. 확인되지 않는 항목은 해당 줄을 생략하세요. 저자 순서를 유지하고 여러 저자는 ·로 구분하세요. 각 값은 한 줄로 작성하세요. 출처 URL과 누락 정보는 코드 블록 밖에 적으세요.\nPARAN  - 1\nAU  - 국문저자\nPY  - 연도\nTI  - 국문논문명\nJO  - 국문학술지명\nVL  - 권\nIS  - 호\nPB  - 학회명\nSP  - 시작페이지\nEP  - 끝페이지\nEA  - 영문저자\nET  - 영문제목\nEJ  - 영문학술지명\nDO  - DOI\nER  -\n\n검색할 논문 제목: `;
  global.ParanFormat=Object.freeze({parse,stringify,prompt});
})(typeof window!=="undefined"?window:globalThis);
