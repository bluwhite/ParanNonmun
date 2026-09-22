/* BibTeX -> 파란 논문 필드 변환 모듈 (단일 항목) */
(function(global){
  "use strict";

  const SUPPORTED_TYPES=new Set([
    "article","book","inbook","incollection",
    "inproceedings","conference","proceedings",
    "mastersthesis","phdthesis","techreport","misc",
    "unpublished"
  ]);

  function cleanText(value){
    return String(value??"")
      .replace(/\r\n?/g,"\n")
      .replace(/\\([#$%&_{}])/g,"$1")
      .replace(/~/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function enclosesWhole(text,open,close){
    let depth=0;
    let quoted=false;
    let escaped=false;

    for(let i=0;i<text.length;i++){
      const ch=text[i];

      if(escaped){
        escaped=false;
        continue;
      }

      if(ch==="\\"){
        escaped=true;
        continue;
      }

      if(ch==='"'){
        quoted=!quoted;
        continue;
      }

      if(quoted)continue;

      if(ch===open)depth++;
      else if(ch===close){
        depth--;
        if(depth===0 && i<text.length-1)return false;
        if(depth<0)return false;
      }
    }

    return depth===0;
  }

  function stripOuter(value){
    let text=String(value??"").trim();

    while(text.length>=2){
      const first=text[0];
      const last=text[text.length-1];

      if(first==="{" && last==="}" && enclosesWhole(text,"{","}")){
        text=text.slice(1,-1).trim();
        continue;
      }

      if(first==='"' && last==='"'){
        text=text.slice(1,-1).trim();
        continue;
      }

      break;
    }

    return text;
  }

  function decodeLatex(value){
    let text=stripOuter(value);

    const accentMap={
      "'":{a:"á",e:"é",i:"í",o:"ó",u:"ú",y:"ý",A:"Á",E:"É",I:"Í",O:"Ó",U:"Ú",Y:"Ý"},
      "\x60":{a:"à",e:"è",i:"ì",o:"ò",u:"ù",A:"À",E:"È",I:"Ì",O:"Ò",U:"Ù"},
      "^":{a:"â",e:"ê",i:"î",o:"ô",u:"û",A:"Â",E:"Ê",I:"Î",O:"Ô",U:"Û"},
      '"':{a:"ä",e:"ë",i:"ï",o:"ö",u:"ü",y:"ÿ",A:"Ä",E:"Ë",I:"Ï",O:"Ö",U:"Ü",Y:"Ÿ"},
      "~":{a:"ã",n:"ñ",o:"õ",A:"Ã",N:"Ñ",O:"Õ"}
    };

    text=text.replace(
      /\{?\\(['\x60\^"~])\{?([A-Za-z])\}?\}?/g,
      (match,mark,letter)=>accentMap[mark]?.[letter]||letter
    );

    text=text
      .replace(/\\ss\b/g,"ß")
      .replace(/\\ae\b/g,"æ")
      .replace(/\\AE\b/g,"Æ")
      .replace(/\\oe\b/g,"œ")
      .replace(/\\OE\b/g,"Œ")
      .replace(/\\o\b/g,"ø")
      .replace(/\\O\b/g,"Ø")
      .replace(/[{}]/g,"");

    return cleanText(text);
  }

  function splitTopLevel(text,separator){
    const result=[];
    let start=0;
    let braceDepth=0;
    let parenDepth=0;
    let quoted=false;
    let escaped=false;

    for(let i=0;i<text.length;i++){
      const ch=text[i];

      if(escaped){
        escaped=false;
        continue;
      }

      if(ch==="\\"){
        escaped=true;
        continue;
      }

      if(ch==='"'){
        quoted=!quoted;
        continue;
      }

      if(quoted)continue;

      if(ch==="{")braceDepth++;
      else if(ch==="}")braceDepth=Math.max(0,braceDepth-1);
      else if(ch==="(")parenDepth++;
      else if(ch===")")parenDepth=Math.max(0,parenDepth-1);
      else if(ch===separator && braceDepth===0 && parenDepth===0){
        result.push(text.slice(start,i));
        start=i+1;
      }
    }

    result.push(text.slice(start));
    return result;
  }

  function parseValue(raw){
    return splitTopLevel(String(raw??""),"#")
      .map(part=>decodeLatex(part))
      .filter(Boolean)
      .join("")
      .trim();
  }

  function findEntry(text){
    const source=String(text||"").trim();
    const match=/@([A-Za-z]+)\s*([\{\(])/.exec(source);

    if(!match){
      throw new Error("BibTeX 항목을 찾지 못했습니다. @article{...} 같은 형식인지 확인하세요.");
    }

    const type=match[1].toLowerCase();
    const open=match[2];
    const close=open==="{" ? "}" : ")";
    const start=match.index+match[0].length;
    let depth=1;
    let quoted=false;
    let escaped=false;
    let end=-1;

    for(let i=start;i<source.length;i++){
      const ch=source[i];

      if(escaped){
        escaped=false;
        continue;
      }

      if(ch==="\\"){
        escaped=true;
        continue;
      }

      if(ch==='"'){
        quoted=!quoted;
        continue;
      }

      if(quoted)continue;

      if(ch===open)depth++;
      else if(ch===close){
        depth--;
        if(depth===0){
          end=i;
          break;
        }
      }
    }

    if(end<0){
      throw new Error("BibTeX 괄호가 닫히지 않았습니다.");
    }

    const tail=source.slice(end+1).trim();
    if(/@[A-Za-z]+\s*[\{\(]/.test(tail)){
      throw new Error("BibTeX는 한 번에 한 항목만 추가할 수 있습니다.");
    }

    if(!SUPPORTED_TYPES.has(type)){
      throw new Error("지원하지 않는 BibTeX 유형입니다: @"+type);
    }

    return {
      type,
      body:source.slice(start,end).trim()
    };
  }

  function parseFields(body){
    const parts=splitTopLevel(body,",");
    const citationKey=cleanText(parts.shift()||"");
    const fields={};

    for(const part of parts){
      const trimmed=part.trim();
      if(!trimmed)continue;

      const eq=trimmed.indexOf("=");
      if(eq<1)continue;

      const name=trimmed.slice(0,eq).trim().toLowerCase();
      const raw=trimmed.slice(eq+1).trim();

      if(name)fields[name]={raw,value:parseValue(raw)};
    }

    return {citationKey,fields};
  }

  function splitAuthors(raw){
    const text=stripOuter(raw);
    const result=[];
    let start=0;
    let depth=0;
    let escaped=false;

    for(let i=0;i<text.length;i++){
      const ch=text[i];

      if(escaped){
        escaped=false;
        continue;
      }

      if(ch==="\\"){
        escaped=true;
        continue;
      }

      if(ch==="{"){
        depth++;
        continue;
      }

      if(ch==="}"){
        depth=Math.max(0,depth-1);
        continue;
      }

      if(depth===0){
        const rest=text.slice(i);
        const match=/^\s+and\s+/i.exec(rest);

        if(match){
          result.push(text.slice(start,i));
          i+=match[0].length-1;
          start=i+1;
        }
      }
    }

    result.push(text.slice(start));

    return result
      .map(author=>decodeLatex(author))
      .map(author=>author.trim())
      .filter(Boolean);
  }

  function first(fields,names){
    for(const name of names){
      const value=fields[name]?.value;
      if(value)return value;
    }
    return "";
  }

  function pageRange(value){
    const text=cleanText(value);
    if(!text)return {startPage:"",endPage:""};

    const match=text.match(/^(.+?)\s*(?:--+|[-–—])\s*(.+)$/);
    if(!match)return {startPage:text,endPage:""};

    return {
      startPage:cleanText(match[1]),
      endPage:cleanText(match[2])
    };
  }

  function pdfNameFromFile(value){
    let text=String(value??"").trim();
    if(!text)return "";

    try{text=decodeURIComponent(text);}catch(_e){}

    text=text.replace(/\\:/g,":");
    const match=text.match(/[^;]*?\.pdf/i);
    if(!match)return "";

    const candidate=match[0];
    const parts=candidate.split(/[\\/]/);
    let name=parts[parts.length-1]||"";

    if(name.includes(":")){
      name=name.slice(name.lastIndexOf(":")+1);
    }

    return /\.pdf$/i.test(name) ? name.trim() : "";
  }

  function thesisLabel(type){
    if(type==="mastersthesis")return "석사학위논문";
    if(type==="phdthesis")return "박사학위논문";
    return "";
  }

  function parse(text){
    const entry=findEntry(text);
    const parsedFields=parseFields(entry.body);
    const citationKey=parsedFields.citationKey;
    const fields=parsedFields.fields;

    const title=first(fields,["title"]);
    if(!title){
      throw new Error("BibTeX에서 title 필드를 찾지 못했습니다.");
    }

    const rawAuthors=fields.author?.raw||"";
    const authorList=splitAuthors(rawAuthors);
    const authors=global.ParanAuthorUtils
      ? global.ParanAuthorUtils.joinAuthors(authorList)
      : authorList.join("·");

    const pages=pageRange(first(fields,["pages"]));
    const journal=
      first(fields,["journal","booktitle"]) ||
      thesisLabel(entry.type);

    const publisher=first(
      fields,
      ["publisher","school","institution","organization"]
    );

    const memoParts=[];
    const note=first(fields,["note"]);
    const doi=first(fields,["doi"]);
    const url=first(fields,["url"]);

    if(note)memoParts.push(note);
    if(doi)memoParts.push("DOI: "+doi);
    if(url)memoParts.push("URL: "+url);

    return {
      check:"",
      authors,
      year:first(fields,["year","date"]),
      title,
      journal,
      volume:first(fields,["volume"]),
      issue:first(fields,["number","issue"]),
      publisher,
      startPage:pages.startPage,
      endPage:pages.endPage,
      memo:memoParts.join(" / "),
      pdf:pdfNameFromFile(first(fields,["file","localfile"])),
      _bibtexType:entry.type,
      _citationKey:citationKey,
      _fields:fields
    };
  }

  global.ParanBibtexParser=Object.freeze({
    parse
  });
})(typeof window!=="undefined" ? window : globalThis);
