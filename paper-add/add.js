const ADD_FIELDS=[
  ["check","확인(*)",false],["authors","저자",true],["year","출판연도",false],
  ["title","논문명",true],["journal","학술지명",true],["volume","권",false],
  ["issue","호",false],["publisher","학회명",true],["startPage","시작페이지",false],
  ["endPage","끝페이지",false],["memo","메모",true],["pdf","PDF",true]
];

const $=id=>document.getElementById(id);
let parsed=null;
let parseTimer=null;

$("versionBadge").textContent=`v${APP_VERSION}`;
document.title=`파란 논문 · 논문 추가 · v${APP_VERSION}`;

function buildPreview(){
  const grid=$("previewGrid");
  grid.replaceChildren();
  for(const [field,label,wide] of ADD_FIELDS){
    const wrap=document.createElement("div");
    wrap.className="field"+(wide?" wide":"");
    const lab=document.createElement("label");
    lab.textContent=label;
    lab.htmlFor=`field-${field}`;
    let input;
    if(["title","journal","publisher","memo","pdf"].includes(field)){
      input=document.createElement("textarea");
    }else{
      input=document.createElement("input");
      input.type="text";
    }
    input.id=`field-${field}`;
    input.dataset.field=field;
    wrap.append(lab,input);
    grid.append(wrap);
  }
}

function fillPreview(record){
  for(const [field] of ADD_FIELDS){
    const el=$(`field-${field}`);
    if(el)el.value=record[field]||"";
  }
}

function collectPreview(){
  const result={};
  for(const [field] of ADD_FIELDS){
    result[field]=$(`field-${field}`).value.trim();
  }
  return result;
}

function parseNow(){
  const text=$("risText").value.trim();
  if(!text){
    parsed=null;
    fillPreview({});
    $("parseState").textContent="RIS 대기 중";
    $("addBtn").disabled=true;
    return;
  }

  try{
    parsed=ParanRisParser.parse(text);
    fillPreview(parsed);
    $("parseState").textContent=`RIS 분석 완료${parsed._risType?` · ${parsed._risType}`:""}`;
    $("addBtn").disabled=!parsed.title;
  }catch(error){
    parsed=null;
    $("parseState").textContent=error.message;
    $("addBtn").disabled=true;
  }
}

$("risText").addEventListener("input",()=>{
  clearTimeout(parseTimer);
  parseTimer=setTimeout(parseNow,220);
});

$("brCleanupBtn").onclick=()=>{
  const textarea=$("risText");
  const before=textarea.value;

  // <br>, <br/>, <br /> 등을 실제 줄바꿈으로 변환한다.
  const after=before.replace(/<br\s*\/?>/gi,"\n");

  if(after===before){
    $("parseState").textContent="변환할 BR 태그가 없습니다.";
    return;
  }

  textarea.value=after;

  // 연속해서 생긴 과도한 빈 줄은 그대로 두고, RIS 파싱만 즉시 다시 수행한다.
  clearTimeout(parseTimer);
  parseNow();

  textarea.focus();
};

$("cancelBtn").onclick=()=>window.close();

$("addBtn").onclick=async()=>{
  try{
    $("addBtn").disabled=true;
    $("parseState").textContent="저장 중...";

    const rootHandle=await loadRootHandle();
    if(!rootHandle)throw new Error("논문 폴더가 연결되지 않았습니다.");
    if(!await ensurePermission(rootHandle,"readwrite",true)){
      throw new Error("폴더 쓰기 권한이 필요합니다.");
    }

    const store=new ParanPaperData.PaperDataStore(rootHandle);
    await store.open();
    await store.addPaper(collectPreview());

    try{
      const channel=new BroadcastChannel("paran-paper-data");
      channel.postMessage({type:"papers-updated",source:"paper-add"});
      channel.close();
    }catch(_e){}

    if(window.opener && !window.opener.closed){
      window.opener.postMessage({type:"paran-paper-added"},location.origin);
    }
    window.close();
  }catch(error){
    console.error(error);
    alert(`논문 추가 실패: ${error.message}`);
    $("parseState").textContent=`오류: ${error.message}`;
    $("addBtn").disabled=false;
  }
};

buildPreview();
