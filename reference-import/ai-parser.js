/* 파란 논문 v0.10.2 - Groq AI 참고문헌 파서 */
(function(global){
  "use strict";

  const ENDPOINT="https://api.groq.com/openai/v1/chat/completions";
  const PRIMARY_MODEL="qwen/qwen3.6-27b";
  const FALLBACK_MODEL="openai/gpt-oss-20b";

  const SYSTEM_PROMPT=`You are a bibliographic citation parser for an academic reference manager.
Determine the citation style automatically. It may be APA, MLA, Chicago, Harvard, Vancouver, IEEE, a Korean academic database export, or a site-specific variation.
Extract ONLY information explicitly present in the reference. Never invent missing facts.
Return one JSON object with exactly these fields:
format, authors, year, title, journal, volume, issue, startPage, endPage.
authors must be an array.
Preserve punctuation inside English names such as "Smith, J.".
Remove trailing citation punctuation from Korean author names such as "신희삼." -> "신희삼".
"Journal Name, (9), 65-88" means volume="", issue="9".
"Journal Name 6.2 (2012): 27-44" means volume="6", issue="2", year="2012".
"Journal Name, 권, 9호, 2018, 65-88" means volume="", issue="9", year="2018".
"Journal Name, 6권, 2호, 2018, 27-44" means volume="6", issue="2", year="2018".
If a field is absent or unclear, use an empty string. Do not return publisher/society names.
Return JSON only.`;

  const STRICT_SCHEMA={
    type:"object",
    additionalProperties:false,
    properties:{
      format:{type:"string"},
      authors:{type:"array",items:{type:"string"}},
      year:{type:"string"},
      title:{type:"string"},
      journal:{type:"string"},
      volume:{type:"string"},
      issue:{type:"string"},
      startPage:{type:"string"},
      endPage:{type:"string"}
    },
    required:["format","authors","year","title","journal","volume","issue","startPage","endPage"]
  };

  const clean=v=>String(v??"").normalize("NFKC").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();

  function cleanNumber(v){
    return clean(v)
      .replace(/^(?:vol(?:ume)?\.?|권)\s*/i,"")
      .replace(/^(?:no\.?|issue|호)\s*/i,"")
      .replace(/^[\s,:;()\[\]]+|[\s,:;()\[\].]+$/g,"")
      .trim();
  }

  function normalizeYear(v){
    const t=clean(v);
    const m=t.match(/(?:19|20)\d{2}/);
    return m?m[0]:t;
  }

  function normalizeAuthors(v){
    if(Array.isArray(v)){
      return global.ParanAuthorUtils
        ? global.ParanAuthorUtils.joinAuthors(v)
        : v.map(clean).filter(Boolean).join("·");
    }
    return global.ParanAuthorUtils
      ? global.ParanAuthorUtils.normalizeAuthors(v)
      : clean(v);
  }

  function normalizeRecord(data,model){
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
      _ai:true,
      _aiModel:model,
      _aiFallback:false,
      _aiPrimaryDiagnostic:null
    };
  }

  function safeStringify(v){
    if(v==null)return "";
    if(typeof v==="string")return v;
    try{return JSON.stringify(v,null,2);}catch(_e){return String(v);}
  }

  function truncate(v,max=5000){
    const t=String(v||"");
    return t.length>max ? t.slice(0,max)+`\n... (${t.length-max}자 생략)` : t;
  }

  function reqId(response){
    return response.headers.get("x-request-id") ||
           response.headers.get("request-id") ||
           response.headers.get("cf-ray") || "";
  }

  function diagnosticFromResponse(model,response,body){
    const e=body?.error||{};
    return {
      model,
      httpStatus:response.status,
      requestId:reqId(response),
      errorType:String(e.type||""),
      errorCode:String(e.code||""),
      message:String(e.message||body?.message||""),
      failedGeneration:truncate(safeStringify(e.failed_generation),5000)
    };
  }

  function diagnosticFromParseError(model,error,body){
    return {
      model,
      httpStatus:200,
      requestId:"",
      errorType:"client_json_parse_error",
      errorCode:"",
      message:error?.message||String(error),
      failedGeneration:truncate(String(body?.choices?.[0]?.message?.content||""),5000)
    };
  }

  function formatDiagnostic(d){
    if(!d)return "";
    const rows=[
      `model: ${d.model||""}`,
      `HTTP: ${d.httpStatus ?? ""}`,
      `type: ${d.errorType||""}`,
      `code: ${d.errorCode||""}`,
      `request id: ${d.requestId||""}`,
      `message: ${d.message||""}`
    ];
    if(d.failedGeneration){
      rows.push("failed_generation / generated content:",d.failedGeneration);
    }
    return rows.join("\n");
  }

  function parseJsonContent(value){
    let text=String(value||"").trim()
      .replace(/^```(?:json)?\s*/i,"")
      .replace(/\s*```$/i,"")
      .trim();

    if(!text)throw new Error("Groq가 빈 응답을 반환했습니다.");

    try{
      const data=JSON.parse(text);
      if(!data || typeof data!=="object" || Array.isArray(data)){
        throw new Error("JSON object가 아님");
      }
      return data;
    }catch(error){
      const e=new Error(`Groq 응답 JSON 파싱 실패: ${error.message}`);
      e.generatedContent=text;
      throw e;
    }
  }

  async function readBody(response){
    try{return await response.json();}
    catch(_e){return null;}
  }

  function isJsonGenerationFailure(response,body){
    if(response.status!==400)return false;
    const e=body?.error||{};
    const m=String(e.message||body?.message||"").toLowerCase();

    return m.includes("failed to validate json") ||
           m.includes("generated json") ||
           (m.includes("json") && m.includes("validate")) ||
           e.failed_generation!=null;
  }

  function apiError(model,response,body){
    const d=diagnosticFromResponse(model,response,body);
    let msg;

    if(response.status===401)msg="Groq API Key가 올바르지 않습니다.";
    else if(response.status===429)msg="Groq 무료 사용 한도 또는 요청 한도에 도달했습니다.";
    else if(response.status===403)msg="Groq API 사용 권한이 없습니다.";
    else if(response.status===400)msg=d.message?`Groq 요청 오류: ${d.message}`:"Groq 요청 형식을 처리하지 못했습니다.";
    else msg=d.message||`Groq AI 요청 실패 (${response.status})`;

    const e=new Error(msg);
    e.diagnostic=d;
    return e;
  }

  async function requestGroq(apiKey,payload,signal){
    let response;

    try{
      response=await fetch(ENDPOINT,{
        method:"POST",
        headers:{
          "Authorization":`Bearer ${apiKey}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify(payload),
        cache:"no-store",
        signal
      });
    }catch(error){
      if(error?.name==="AbortError")throw error;

      const e=new Error("Groq API에 연결하지 못했습니다.");
      e.diagnostic={
        model:payload.model,
        httpStatus:"",
        requestId:"",
        errorType:"network_error",
        errorCode:"",
        message:error?.message||String(error),
        failedGeneration:""
      };
      throw e;
    }

    return {
      response,
      body:await readBody(response)
    };
  }

  function primaryPayload(reference){
    return {
      model:PRIMARY_MODEL,
      messages:[
        {
          role:"system",
          content:SYSTEM_PROMPT+"\nThe output MUST be exactly one valid JSON object."
        },
        {
          role:"user",
          content:reference
        }
      ],
      response_format:{type:"json_object"},
      reasoning_effort:"none",
      temperature:0.1,
      max_completion_tokens:600,
      stream:false
    };
  }

  function fallbackPayload(reference){
    return {
      model:FALLBACK_MODEL,
      messages:[
        {role:"system",content:SYSTEM_PROMPT},
        {role:"user",content:reference}
      ],
      response_format:{
        type:"json_schema",
        json_schema:{
          name:"bibliographic_reference",
          strict:true,
          schema:STRICT_SCHEMA
        }
      },
      reasoning_effort:"low",
      temperature:0.1,
      max_completion_tokens:600,
      stream:false
    };
  }

  function extractData(body,model){
    return normalizeRecord(
      parseJsonContent(body?.choices?.[0]?.message?.content),
      model
    );
  }

  async function parse(text,rootHandle){
    const reference=String(text||"").trim();

    if(!reference)throw new Error("AI로 분석할 참고문헌을 입력하세요.");
    if(!rootHandle)throw new Error("논문 폴더가 연결되지 않았습니다.");

    const config=await ParanAiConfig.loadConfig(rootHandle);

    if(!config){
      throw new Error(
        "AI 설정이 없습니다. 메인 화면의 'AI 설정'에서 Groq API Key를 저장하세요."
      );
    }

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45000);
    let primaryDiag=null;

    try{
      const primary=await requestGroq(
        config.apiKey,
        primaryPayload(reference),
        controller.signal
      );

      if(primary.response.ok){
        try{
          return extractData(primary.body,PRIMARY_MODEL);
        }catch(error){
          primaryDiag=diagnosticFromParseError(
            PRIMARY_MODEL,error,primary.body
          );
          console.warn("[파란논문 AI] Qwen 응답 JSON 파싱 실패",primaryDiag);
        }
      }else{
        primaryDiag=diagnosticFromResponse(
          PRIMARY_MODEL,primary.response,primary.body
        );
        console.warn("[파란논문 AI] Qwen 요청 실패",primaryDiag);

        if(!isJsonGenerationFailure(primary.response,primary.body)){
          throw apiError(PRIMARY_MODEL,primary.response,primary.body);
        }
      }

      const fallback=await requestGroq(
        config.apiKey,
        fallbackPayload(reference),
        controller.signal
      );

      if(!fallback.response.ok){
        const f=apiError(FALLBACK_MODEL,fallback.response,fallback.body);
        const e=new Error(
          "Qwen JSON 생성 실패 후 Strict fallback도 실패했습니다."
        );
        e.diagnostic={
          primary:primaryDiag,
          fallback:f.diagnostic
        };
        console.error("[파란논문 AI] 두 모델 모두 실패",e.diagnostic);
        throw e;
      }

      let record;
      try{
        record=extractData(fallback.body,FALLBACK_MODEL);
      }catch(error){
        const fd=diagnosticFromParseError(
          FALLBACK_MODEL,error,fallback.body
        );
        const e=new Error(
          "Strict fallback 응답을 처리하지 못했습니다."
        );
        e.diagnostic={
          primary:primaryDiag,
          fallback:fd
        };
        throw e;
      }

      record._aiFallback=true;
      record._aiPrimaryDiagnostic=primaryDiag;
      console.info(
        "[파란논문 AI] Qwen 실패 후 Strict fallback 성공",
        primaryDiag
      );

      return record;

    }catch(error){
      if(error?.name==="AbortError"){
        const e=new Error(
          "Groq 응답 시간이 너무 길어 요청을 중단했습니다."
        );
        e.diagnostic={
          primary:primaryDiag,
          fallback:null
        };
        throw e;
      }

      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  global.ParanAiParser=Object.freeze({
    parse,
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    formatDiagnostic
  });
})(window);
