const ADD_FIELDS=[
  ["authors","저자",true],["year","출판연도",false],
  ["title","논문명",true],["journal","학술지명",true],["volume","권",false],
  ["issue","호",false],["publisher","학회명",true],["startPage","시작페이지",false],
  ["endPage","끝페이지",false],["memo","메모",true],["pdf","PDF",true]
];

const $=id=>document.getElementById(id);
let parsed=null;
let journalInfoReady=false;
let journalInfoLoadError=null;

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

  grid.addEventListener("input",()=>{
    $("addBtn").disabled=!$("field-title").value.trim();
  });
}

function fillPreview(record){
  for(const [field] of ADD_FIELDS){
    const el=$(`field-${field}`);
    if(el)el.value=record[field]||"";
  }
}

function clearPreview(){
  parsed=null;
  fillPreview({});
  $("addBtn").disabled=true;
}

function collectPreview(){
  const result={check:""};

  for(const [field] of ADD_FIELDS){
    result[field]=$(`field-${field}`).value.trim();
  }

  return result;
}

function inputText(){
  return $("risText").value.trim();
}

async function ensureJournalInfo(){
  if(journalInfoReady)return true;
  if(journalInfoLoadError)throw journalInfoLoadError;

  try{
    const count=await ParanApaParser.loadJournalInfo(
      "../reference-data/journal-info.json"
    );
    journalInfoReady=true;
    console.info(`학술지 정보 ${count}개 로드 완료`);
    return true;
  }catch(error){
    journalInfoLoadError=error;
    throw error;
  }
}

function parseRis(){
  const text=inputText();

  if(!text){
    clearPreview();
    $("parseState").textContent="RIS 내용을 입력하세요.";
    return;
  }

  try{
    parsed=ParanRisParser.parse(text);
    fillPreview(parsed);
    $("parseState").textContent=
      `RIS 분석 완료${parsed._risType?` · ${parsed._risType}`:""}`;
    $("addBtn").disabled=!parsed.title;
  }catch(error){
    clearPreview();
    $("parseState").textContent=error.message;
  }
}

async function parseApa(){
  const text=inputText();

  if(!text){
    clearPreview();
    $("parseState").textContent="APA 내용을 입력하세요.";
    return;
  }

  const button=$("apaParseBtn");

  try{
    button.disabled=true;
    $("parseState").textContent="APA 분석 중...";

    await ensureJournalInfo();

    parsed=ParanApaParser.parse(text);
    fillPreview(parsed);
    $("addBtn").disabled=!parsed.title;

    if(parsed._journalMatched){
      const count=parsed._publisherCandidates?.length||0;

      if(count>1){
        $("parseState").textContent=
          `APA 분석 완료 · 학술지 정보 일치 · 학회명 후보 ${count}개 중 첫 번째 적용`;
      }else{
        $("parseState").textContent=
          "APA 분석 완료 · 학술지 정보 일치";
      }
    }else if(parsed.journal){
      $("parseState").textContent=
        "APA 분석 완료 · 학술지명은 찾았지만 학회명 정보가 없습니다.";
    }else{
      $("parseState").textContent=
        "APA 분석 완료 · 학술지명을 확인해 주세요.";
    }
  }catch(error){
    clearPreview();
    $("parseState").textContent=`APA 분석 실패: ${error.message}`;
  }finally{
    button.disabled=false;
  }
}

$("risText").addEventListener("input",()=>{
  // 입력 내용이 바뀌면 이전 분석 결과를 그대로 저장하지 못하게 한다.
  clearPreview();
  $("parseState").textContent=
    "입력됨 · RIS 또는 APA 버튼을 누르세요.";
});

$("brCleanupBtn").onclick=()=>{
  const textarea=$("risText");
  const before=textarea.value;
  const after=before.replace(/<br\s*\/?>/gi,"\n");

  if(after===before){
    $("parseState").textContent=
      "변환할 BR 태그가 없습니다.";
    return;
  }

  textarea.value=after;
  clearPreview();
  $("parseState").textContent=
    "BR 태그를 줄바꿈으로 변환했습니다. RIS 또는 APA 버튼을 누르세요.";
  textarea.focus();
};

$("risParseBtn").onclick=parseRis;
$("apaParseBtn").onclick=parseApa;
$("cancelBtn").onclick=()=>window.close();

$("addBtn").onclick=async()=>{
  try{
    $("addBtn").disabled=true;
    $("parseState").textContent="저장 중...";

    const rootHandle=await loadRootHandle();
    if(!rootHandle){
      throw new Error("논문 폴더가 연결되지 않았습니다.");
    }

    if(!await ensurePermission(rootHandle,"readwrite",true)){
      throw new Error("폴더 쓰기 권한이 필요합니다.");
    }

    const store=new ParanPaperData.PaperDataStore(rootHandle);
    await store.open();
    await store.addPaper(collectPreview());

    try{
      const channel=new BroadcastChannel("paran-paper-data");
      channel.postMessage({
        type:"papers-updated",
        source:"paper-add"
      });
      channel.close();
    }catch(_e){}

    if(window.opener&&!window.opener.closed){
      window.opener.postMessage(
        {type:"paran-paper-added"},
        location.origin
      );
    }

    window.close();
  }catch(error){
    console.error(error);
    alert(`논문 추가 실패: ${error.message}`);
    $("parseState").textContent=`오류: ${error.message}`;
    $("addBtn").disabled=!$("field-title").value.trim();
  }
};

buildPreview();

// 창이 열린 직후 미리 학술지 정보를 읽어 둔다.
// 실패해도 RIS 기능은 정상적으로 사용할 수 있다.
ensureJournalInfo().catch(error=>{
  console.warn("학술지 정보 사전 로드 실패:",error);
});
