/* RIS -> 파란 논문 12열 변환 모듈 */
(function(global){
  "use strict";

  function parseTags(text){
    const tags={};
    let lastTag=null;
    for(const rawLine of String(text||"").replace(/\r\n?/g,"\n").split("\n")){
      const line=rawLine.replace(/\s+$/,"");
      const match=line.match(/^([A-Z0-9]{2})\s{0,2}-\s?(.*)$/);
      if(match){
        const tag=match[1];
        const value=match[2]||"";
        if(!tags[tag]) tags[tag]=[];
        tags[tag].push(value);
        lastTag=tag;
      }else if(lastTag && line.trim()){
        const arr=tags[lastTag];
        arr[arr.length-1]+=" "+line.trim();
      }
    }
    return tags;
  }

  function first(tags,names){
    for(const name of names){
      const value=tags[name]?.find(v=>String(v).trim());
      if(value != null) return String(value).trim();
    }
    return "";
  }

  function all(tags,names){
    const out=[];
    for(const name of names){
      for(const value of tags[name]||[]){
        const v=String(value).trim();
        if(v) out.push(v);
      }
    }
    return out;
  }

  function normalizeAuthor(author){
    const value=String(author||"").trim().replace(/\.$/,"");
    // 기존 Excel 데이터의 '성·이니셜' 표기를 최대한 따름.
    return value.replace(/^([^,]+),\s*(.+)$/,"$1·$2");
  }

  function extractYear(value){
    const match=String(value||"").match(/(?:19|20)\d{2}/);
    return match ? match[0] : String(value||"").trim();
  }

  function pdfNameFromLink(value){
    let v=String(value||"").trim();
    if(!v) return "";
    try{ v=decodeURIComponent(v); }catch(_e){}
    v=v.replace(/^file:\/\//i,"").replace(/^\/+([A-Za-z]:)/,"$1");
    const clean=v.split(/[?#]/)[0];
    const parts=clean.split(/[\\/]/);
    const name=parts[parts.length-1]||"";
    return /\.pdf$/i.test(name) ? name : "";
  }

  function parse(text){
    const tags=parseTags(text);
    const type=first(tags,["TY"]);
    const title=first(tags,["TI","T1","CT"]);

    if(!type && !title){
      throw new Error("RIS 형식을 찾지 못했습니다. 'TY  -' 또는 'TI  -' 항목이 있는지 확인하세요.");
    }

    const authors=all(tags,["AU","A1"])
      .map(normalizeAuthor)
      .filter(Boolean)
      .join(", ");

    const rawYear=first(tags,["PY","Y1","DA"]);
    const pdfLink=first(tags,["L1","L2"]);
    const notes=all(tags,["N1","N2"]).join(" / ");

    return {
      check:"",
      authors,
      year:extractYear(rawYear),
      title,
      journal:first(tags,["JO","JF","JA","T2"]),
      volume:first(tags,["VL"]),
      issue:first(tags,["IS"]),
      publisher:first(tags,["PB"]),
      startPage:first(tags,["SP"]),
      endPage:first(tags,["EP"]),
      memo:notes,
      pdf:pdfNameFromLink(pdfLink),
      _risType:type,
      _tags:tags
    };
  }

  global.ParanRisParser=Object.freeze({parse,parseTags});
})(typeof window!=="undefined" ? window : globalThis);
