/* 파란 논문 - Groq AI 참고문헌 파서 */
(function(global){
  "use strict";

  const ENDPOINT="https://api.groq.com/openai/v1/chat/completions";

  const SYSTEM_PROMPT=`You are a bibliographic citation parser for an academic reference manager.

The user will send exactly one bibliographic reference or citation. Determine its citation style automatically. It may be APA, MLA, Chicago, Harvard, Vancouver, IEEE, a Korean academic database export, or a site-specific variation.

Return ONLY one valid JSON object with exactly these keys:
{
  "format": "",
  "authors": [],
  "year": "",
  "title": "",
  "journal": "",
  "volume": "",
  "issue": "",
  "startPage": "",
  "endPage": ""
}

Rules:
1. Extract only facts explicitly present in the reference. Never invent missing information.
2. If a field is absent or unclear, return an empty string. authors must always be an array.
3. Return one author per authors array item. Do not include separators such as middle dots, semicolons, "and", or "&" in an author item.
4. Preserve meaningful punctuation inside an English personal name, e.g. "Smith, J.".
5. Remove citation punctuation from the end of Korean author names, e.g. "신희삼." becomes "신희삼".
6. journal must contain only the journal/periodical title, excluding volume, issue, year, pages, publisher, DOI, and URL.
7. "Journal Name, (9), 65-88" means volume="", issue="9", startPage="65", endPage="88".
8. "Journal Name 6.2 (2012): 27-44" means volume="6", issue="2", year="2012", startPage="27", endPage="44".
9. "Journal Name, 권, 9호, 2018, 65-88" means volume="", issue="9", year="2018".
10. "Journal Name, 6권, 2호, 2018, 27-44" means volume="6", issue="2", year="2018".
11. Page fields contain page values only, without p., pp., colon, or dash.
12. Do not return publisher or academic society names. The application resolves those locally.
13. format should contain a short detected style label such as APA, MLA, Chicago, Harvard, Vancouver, IEEE, RIS-like, Korean DB, or UNKNOWN.
14. The response must be JSON only. No markdown, explanation, or code fences.`;

  function clean(value){
    return String(value??"")
      .normalize("NFKC")
      .replace(/\u00a0/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function cleanNumber(value){
    return clean(value)
      .replace(/^(?:vol(?:ume)?\.?|권)\s*/i,"")
      .replace(/^(?:no\.?|issue|호)\s*/i,"")
      .replace(/^[\s,:;()\[\]]+|[\s,:;()\[\].]+$/g,"")
      .trim();
  }

  function normalizeYear(value){
    const text=clean(value);
    const match=text.match(/(?:19|20)\d{2}/);
    return match ? match[0] : text;
  }

  function normalizeAuthors(value){
    if(Array.isArray(value)){
      return global.ParanAuthorUtils
        ? global.ParanAuthorUtils.joinAuthors(value)
        : value.map(clean).filter(Boolean).join("·");
    }

    return global.ParanAuthorUtils
      ? global.ParanAuthorUtils.normalizeAuthors(value)
      : clean(value);
  }

  function normalizeRecord(data){
    return {
      check:"",
      authors:normalizeAuthors(data?.authors),
      year:normalizeYear(data?.year),
      title:clean(data?.title),
      journal:clean(data?.journal),
      volume:cleanNumber(data?.volume),
      issue:cleanNumber(data?.issue),
      publisher:"",
      startPage:cleanNumber(data?.startPage),
      endPage:cleanNumber(data?.endPage),
      memo:"",
      pdf:"",
      _format:"AI",
      _detectedFormat:clean(data?.format)||"UNKNOWN",
      _ai:true
    };
  }

  function parseJsonContent(value){
    let text=String(value||"").trim();
    if(!text)throw new Error("Groq가 빈 응답을 반환했습니다.");

    text=text
      .replace(/^```(?:json)?\s*/i,"")
      .replace(/\s*```$/i,"")
      .trim();

    let data;
    try{
      data=JSON.parse(text);
    }catch(_error){
      throw new Error("Groq 응답을 JSON으로 해석하지 못했습니다.");
    }

    if(!data || typeof data!=="object" || Array.isArray(data)){
      throw new Error("Groq가 올바른 참고문헌 객체를 반환하지 않았습니다.");
    }

    return data;
  }

  async function parse(text,rootHandle){
    const reference=String(text||"").trim();

    if(!reference)throw new Error("AI로 분석할 참고문헌을 입력하세요.");
    if(!rootHandle)throw new Error("논문 폴더가 연결되지 않았습니다.");

    const config=await ParanAiConfig.loadConfig(rootHandle);
    if(!config){
      throw new Error("AI 설정이 없습니다. 메인 화면의 'AI 설정'에서 Groq API Key를 저장하세요.");
    }

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45000);
    let response;

    try{
      response=await fetch(ENDPOINT,{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${config.apiKey}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          model:ParanAiConfig.MODEL,
          messages:[
            {role:"system",content:SYSTEM_PROMPT},
            {role:"user",content:reference}
          ],
          response_format:{type:"json_object"},
          temperature:0.2,
          max_completion_tokens:800,
          stream:false
        }),
        cache:"no-store",
        signal:controller.signal
      });
    }catch(error){
      if(error?.name==="AbortError"){
        throw new Error("Groq 응답 시간이 너무 길어 요청을 중단했습니다.");
      }
      throw new Error(
        "Groq API에 연결하지 못했습니다. 인터넷 연결 또는 브라우저 네트워크 정책을 확인하세요."
      );
    }finally{
      clearTimeout(timeout);
    }

    let body=null;
    try{ body=await response.json(); }catch(_error){}

    if(!response.ok){
      const apiMessage=body?.error?.message || body?.message || "";

      if(response.status===401){
        throw new Error("Groq API Key가 올바르지 않습니다. 메인 화면의 AI 설정을 확인하세요.");
      }
      if(response.status===429){
        throw new Error("Groq 무료 사용 한도 또는 요청 한도에 도달했습니다.");
      }
      if(response.status===400){
        throw new Error(apiMessage ? `Groq 요청 오류: ${apiMessage}` : "Groq 요청 형식을 처리하지 못했습니다.");
      }

      throw new Error(apiMessage || `Groq AI 요청 실패 (${response.status})`);
    }

    const content=body?.choices?.[0]?.message?.content;
    const data=parseJsonContent(content);
    return normalizeRecord(data);
  }

  global.ParanAiParser=Object.freeze({parse});
})(window);
