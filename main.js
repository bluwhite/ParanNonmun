let rootHandle=null;
let pdfs=[];
let dataStore=null;
let paperData={columns:[],papers:[],sheetSnapshot:null};

const $=id=>document.getElementById(id);

$("versionBadge").textContent=`v${APP_VERSION}`;
document.title=`파란 논문 · v${APP_VERSION}`;

async function walk(dir,prefix=""){
  const out=[];
  for await(const [name,h] of dir.entries()){
    if(name===ParanPaperData.DATA_FILE_NAME)continue;
    const path=prefix?`${prefix}/${name}`:name;
    if(h.kind==="directory"){
      out.push(...await walk(h,path));
    }else if(h.kind==="file"&&name.toLowerCase().endsWith(".pdf")){
      const f=await h.getFile();
      out.push({name,path,size:f.size,handle:h});
    }
  }
  return out;
}

function setFolderReady(ready){
  for(const id of [
    "noteSearchBtn","addPaperBtn","paperFindBtn","aiSettingsBtn",
    "pdfLinkBtn","pdfOpenBtn","excelImportBtn","referenceFormatBtn",
    "referenceOutputBtn"
  ]){
    const el=$(id);
    if(el)el.disabled=!ready;
  }
}

function setFolderInfo(text,kind=""){
  const el=$("folderInfo");
  if(!el)return;
  el.textContent=text;
  el.className=`folder-info ${kind}`.trim();
}

function setSaveState(text,kind=""){
  const el=$("saveState");
  el.textContent=text;
  el.className=`save-state ${kind}`.trim();
}

function setPaperCount(count){
  $("paperCount").textContent=`논문 ${count}편`;
}

async function savePaperData(nextData){
  paperData=nextData;
  await dataStore.save(paperData);
  paperData=dataStore.data;
}

async function mountPaperSheet(){
  await ParanPaperSheet.mount({
    containerId:"paperSheet",
    data:paperData,
    onDataChange:savePaperData,
    onCount:setPaperCount,
    onStatus:setSaveState,
    onPdfDoubleClick:context=>openPdfFromRowContext(context,false)
  });
}

async function openDataFile(){
  dataStore=new ParanPaperData.PaperDataStore(rootHandle);
  const {data,created,migrated}=await dataStore.open();
  paperData=data;

  setSaveState("스프레드시트 준비 중...","saving");
  await mountPaperSheet();
  setPaperCount(paperData.papers.length);
  setSaveState("저장됨","saved");
}

async function reloadDataFile(){
  if(!dataStore)return;
  paperData=await dataStore.reload();
  await ParanPaperSheet.reload(paperData);
  setPaperCount(paperData.papers.length);
  setSaveState("저장됨","saved");
}

async function saveNow(){
  if(!dataStore)return;
  setSaveState("저장 중...","saving");
  try{
    const synced=await ParanPaperSheet.flush();
    if(synced)paperData=synced;
    setSaveState("저장됨","saved");
  }catch(error){
    console.error(error);
    setSaveState(`저장 실패: ${error.message}`,"error");
    throw error;
  }
}

async function findInSheet(){
  const query=$("paperSearchBox").value;
  if(!query.trim())return;
  const found=await ParanPaperSheet.findNext(query);
  if(!found)alert(`"${query.trim()}"을(를) 찾지 못했습니다.`);
}



async function saveReferenceFormatGroups(groups){
  if(!dataStore || !rootHandle){
    throw new Error("먼저 논문 폴더를 선택하세요.");
  }

  const synced=await ParanPaperSheet.flush();
  if(synced)paperData=synced;

  paperData={
    ...paperData,
    referenceFormatGroups:
      ParanPaperData.normalizeReferenceFormatGroups(groups)
  };

  await dataStore.save(paperData);
  paperData=dataStore.data;

  // 이후 시트 셀을 편집해 저장해도 양식 그룹이 사라지지 않도록
  // Univer 내부 currentData에도 같은 값을 유지한다.
  ParanPaperSheet.setReferenceFormatGroups(
    paperData.referenceFormatGroups
  );

  setSaveState(
    `참고문헌 양식 저장됨 · ${paperData.referenceFormatGroups.length}개 그룹`,
    "saved"
  );

  return paperData.referenceFormatGroups;
}

async function openReferenceFormatManager(){
  if(!rootHandle || !dataStore){
    alert("먼저 논문 폴더를 선택하세요.");
    return;
  }

  try{
    const synced=await ParanPaperSheet.flush();
    if(synced)paperData=synced;

    ParanReferenceFormatManager.open({
      groups:paperData.referenceFormatGroups,
      onSave:saveReferenceFormatGroups
    });
  }catch(error){
    console.error(error);

    const message=
      `참고문헌 양식 관리 오류: ${error.message}`;

    setSaveState(message,"error");
    alert(message);
  }
}


async function openReferenceOutput(){
  if(!rootHandle || !dataStore){
    alert("먼저 논문 폴더를 선택하세요.");
    return;
  }

  try{
    // 출력 순서가 실제 시트 행 순서와 정확히 같도록
    // 열기 직전에 현재 Univer 시트를 JSON 데이터로 동기화한다.
    const synced=await ParanPaperSheet.flush();
    if(synced)paperData=synced;

    ParanReferenceOutput.open({
      groups:paperData.referenceFormatGroups,
      papers:paperData.papers
    });
  }catch(error){
    console.error(error);

    const message=
      `참고문헌 출력 오류: ${error.message}`;

    setSaveState(message,"error");
    alert(message);
  }
}


async function importExcelReferences(){
  if(!rootHandle || !dataStore){
    alert("먼저 논문 폴더를 선택하세요.");
    return;
  }

  try{
    const headers=
      ParanPaperSheet.getColumnHeaders?.() || [];

    if(!headers.length){
      throw new Error(
        "현재 논문 목록의 열 정보를 읽지 못했습니다."
      );
    }

    setSaveState(
      "가져올 Excel 파일을 선택하세요.",
      "saving"
    );

    const parsed=
      await ParanExcelImport.pickAndParse(
        headers,
        rootHandle
      );

    if(!parsed){
      setSaveState("저장됨","saved");
      return;
    }

    if(!parsed.rows.length){
      throw new Error(
        "제목 행 아래에서 가져올 참고문헌 데이터를 찾지 못했습니다."
      );
    }

    const matched=parsed.matchedHeaders.join(", ");

    const ok=confirm(
      `${parsed.fileName}\n\n`+
      `시트: ${parsed.sheetName}\n`+
      `제목 행: ${parsed.headerRow}행\n`+
      `일치한 열: ${matched}\n`+
      `가져올 행: ${parsed.rows.length}개\n\n`+
      "현재 논문 목록의 마지막 행 뒤에 추가할까요?"
    );

    if(!ok){
      setSaveState(
        "엑셀 가져오기를 취소했습니다."
      );
      return;
    }

    setSaveState(
      `엑셀 ${parsed.rows.length}개 행 가져오는 중...`,
      "saving"
    );

    const result=
      await ParanPaperSheet.appendImportedRows(
        parsed.rows
      );

    if(!result.count){
      throw new Error(
        "현재 시트의 컬럼명과 일치하는 데이터가 없습니다."
      );
    }

    paperData=result.data || ParanPaperSheet.getData();
    setPaperCount(paperData?.papers?.length || 0);

    setSaveState(
      `엑셀 가져오기 완료 · ${result.count}개 · ${parsed.sheetName} ${parsed.headerRow}행 제목`,
      "saved"
    );
  }catch(error){
    if(error?.name==="AbortError"){
      setSaveState("저장됨","saved");
      return;
    }

    console.error(error);

    const message=
      `엑셀 가져오기 실패: ${error.message}`;

    setSaveState(message,"error");
    alert(message);
  }
}


function setAiSettingsState(text,kind=""){
  const el=$("aiSettingsState");
  if(!el)return;
  el.textContent=text;
  el.className=`ai-settings-state ${kind}`.trim();
}

function markAiConfigured(configured){
  const button=$("aiSettingsBtn");
  if(!button)return;

  button.classList.toggle("configured",configured);
  button.textContent=configured ? "AI 설정 ✓" : "AI 설정";
  button.title=configured
    ? "현재 폴더에 AI 설정이 저장되어 있습니다."
    : "현재 폴더의 AI 설정";
}

async function refreshAiConfigStatus(){
  if(!rootHandle){
    markAiConfigured(false);
    return false;
  }

  try{
    const configured=
      await ParanAiConfig.hasConfig(rootHandle);

    markAiConfigured(configured);
    return configured;
  }catch(_error){
    markAiConfigured(false);
    return false;
  }
}

async function openAiSettings(){
  if(!rootHandle){
    alert("먼저 논문 폴더를 선택하세요.");
    return;
  }

  const dialog=$("aiSettingsDialog");
  const keyInput=$("aiApiKey");

  keyInput.value="";
  keyInput.type="password";
  setAiSettingsState("설정을 불러오는 중...","saving");

  try{
    const config=await ParanAiConfig.loadConfig(rootHandle);

    if(config){
      keyInput.value=config.apiKey;
      setAiSettingsState(
        `Groq 설정을 불러왔습니다 · ${ParanAiConfig.MODEL}`,
        "saved"
      );
    }else{
      setAiSettingsState("Groq API Key를 입력하세요.");
    }
  }catch(error){
    setAiSettingsState(error.message,"error");
  }

  dialog.showModal();
  setTimeout(()=>keyInput.focus(),0);
}

async function saveAiSettings(){
  if(!rootHandle)return;

  const saveButton=$("aiSettingsSaveBtn");
  saveButton.disabled=true;
  setAiSettingsState("암호화해서 저장 중...","saving");

  try{
    if(
      !await ensurePermission(
        rootHandle,
        "readwrite",
        true
      )
    ){
      throw new Error(
        "논문 폴더 쓰기 권한이 필요합니다."
      );
    }

    await ParanAiConfig.saveConfig(
      rootHandle,
      {
        apiKey:$("aiApiKey").value
      }
    );

    markAiConfigured(true);
    setAiSettingsState(
      `${ParanAiConfig.CONFIG_FILE_NAME} 저장 완료`,
      "saved"
    );

    setTimeout(()=>{
      if($("aiSettingsDialog").open){
        $("aiSettingsDialog").close();
      }
    },350);
  }catch(error){
    console.error(error);
    setAiSettingsState(
      `저장 실패: ${error.message}`,
      "error"
    );
  }finally{
    saveButton.disabled=false;
  }
}



function markDownloadLocation(configured=false){
  const button=$("downloadFolderBtn");
  if(!button)return;

  button.classList.toggle("configured",configured);
  button.textContent=configured
    ? "다운로드 위치 ✓"
    : "다운로드 위치";
  button.title=configured
    ? "PDF 선택창이 최근 선택한 다운로드 위치를 기억합니다."
    : "PDF 선택창이 시작할 다운로드 위치를 지정합니다.";
}

async function chooseDownloadLocation(){
  try{
    const selected=
      await ParanPdfLink.rememberDownloadLocation();

    if(!selected)return;

    markDownloadLocation(true);

    setSaveState(
      "다운로드 위치를 기억했습니다. 선택한 PDF는 변경하지 않았습니다.",
      "saved"
    );
  }catch(error){
    if(error?.name==="AbortError")return;

    console.error(error);
    setSaveState(
      `다운로드 위치 오류: ${error.message}`,
      "error"
    );
    alert(`다운로드 위치 오류: ${error.message}`);
  }
}

function selectedPaperContext(){
  const context=
    ParanPaperSheet.getSelectedRowContext?.();

  if(!context || context.rowIndex<=0){
    throw new Error("먼저 논문 목록에서 작업할 행의 셀을 선택하세요.");
  }

  return context;
}

function failPdfAction(message){
  setSaveState(message,"error");
  alert(message);
}

async function linkPdfToSelectedRow(){
  if(!rootHandle){
    failPdfAction("PDF 연결 실패: 먼저 논문 폴더를 선택하세요.");
    return;
  }

  let context;

  try{
    context=selectedPaperContext();

    const title=String(context.title||"").trim();

    if(!title){
      failPdfAction(
        "PDF 연결 실패: 선택한 행에 논문명이 없습니다."
      );
      return;
    }

    const selected=await ParanPdfLink.pickPdf();

    if(!selected)return;

    setSaveState("PDF를 논문 폴더로 복사 중...","saving");

    const copied=
      await ParanPdfLink.copyPdfToLibrary(
        selected.fileHandle,
        rootHandle,
        title
      );

    try{
      await ParanPaperSheet.setSystemFieldAtRow(
        context.rowIndex,
        "pdf",
        copied.baseName
      );
    }catch(error){
      try{
        await rootHandle.removeEntry(copied.fileName);
      }catch(_e){}
      throw error;
    }

    const sourceDeleted=
      await ParanPdfLink.removeSourceFile(
        selected.fileHandle
      );

    await scanPdfs();

    if(sourceDeleted){
      setSaveState(
        `PDF 연결 완료: ${copied.fileName}`,
        "saved"
      );
    }else{
      setSaveState(
        `PDF 연결 완료: ${copied.fileName} · 원본 PDF는 자동 삭제하지 못했습니다.`,
        "warning"
      );
    }
  }catch(error){
    if(error?.name==="AbortError")return;

    console.error(error);
    failPdfAction(
      `PDF 연결 실패: ${error.message}`
    );
  }
}

function currentPdfPath(value){
  return ParanPdfLink.findPdfPath(
    pdfs,
    value
  );
}

async function openPdfFromRowContext(context,showErrors=true){
  try{
    if(!context || context.rowIndex<=0){
      throw new Error(
        "먼저 논문 목록에서 PDF를 열 행의 셀을 선택하세요."
      );
    }

    const pdfValue=String(context.pdf||"").trim();

    if(!pdfValue){
      throw new Error(
        "선택한 행에 연결된 PDF가 없습니다."
      );
    }

    let path=currentPdfPath(pdfValue);

    if(path){
      openPdf(path);
      return;
    }

    const pending=window.open("about:blank","_blank");

    await scanPdfs();
    path=currentPdfPath(pdfValue);

    if(!path){
      try{pending?.close?.();}catch(_e){}
      throw new Error(
        `연결된 PDF 파일을 논문 폴더에서 찾지 못했습니다: ${pdfValue}`
      );
    }

    const url=new URL(
      "./pdf-editor/index.html",
      location.href
    );
    url.searchParams.set("file",path);

    if(pending){
      pending.location.href=url.toString();
    }else{
      openPdf(path);
    }
  }catch(error){
    console.error(error);

    if(showErrors){
      failPdfAction(
        `PDF 열기 실패: ${error.message}`
      );
    }else{
      setSaveState(
        `PDF 열기 실패: ${error.message}`,
        "error"
      );
    }
  }
}

function openPdfForSelectedRow(){
  let context;

  try{
    context=selectedPaperContext();
  }catch(error){
    failPdfAction(
      `PDF 열기 실패: ${error.message}`
    );
    return;
  }

  openPdfFromRowContext(context,true);
}

async function scanPdfs(){
  pdfs=await walk(rootHandle);
  pdfs.sort((a,b)=>a.path.localeCompare(b.path,"ko"));
  $("noteSearchStatus").textContent=`PDF ${pdfs.length}개 준비됨 · 메모 검색 가능`;
}

async function connectFolder(handle,mayPrompt=true){
  rootHandle=handle;

  if(!await ensurePermission(rootHandle,"readwrite",mayPrompt)){
    setFolderInfo(`현재 폴더: ${rootHandle.name} · 권한 필요`,"warning");
    setFolderReady(false);
    return;
  }

  await saveRootHandle(rootHandle);
  setFolderInfo(`현재 폴더: ${rootHandle.name} · 연결 중...`,"loading");
  await openDataFile();
  setFolderReady(true);
  setFolderInfo(`현재 폴더: ${rootHandle.name}`,"connected");
  refreshAiConfigStatus().catch(console.error);

  scanPdfs().catch(error=>{
    console.error(error);
    $("noteSearchStatus").textContent=`PDF 검색 오류: ${error.message}`;
  });
}

function openPdf(path,page=null){
  const u=new URL("./pdf-editor/index.html",location.href);
  u.searchParams.set("file",path);
  if(page)u.searchParams.set("page",page);
  window.open(u.toString(),"_blank");
}

function renderNoteResults(results){
  const noteBody=$("noteBody");
  noteBody.replaceChildren();

  if(!results.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=3;
    td.className="empty";
    td.textContent="일치하는 메모가 없습니다.";
    tr.append(td);
    noteBody.append(tr);
    return;
  }

  for(const note of results){
    const tr=document.createElement("tr");
    const fileTd=document.createElement("td");
    const pageTd=document.createElement("td");
    const textTd=document.createElement("td");
    const fileBtn=document.createElement("button");

    fileBtn.className="note-file";
    fileBtn.textContent=note.name;
    fileBtn.title=note.path;
    fileBtn.onclick=()=>openPdf(note.path,note.page);
    fileTd.append(fileBtn);

    pageTd.textContent=note.page;
    pageTd.className="note-page";
    textTd.textContent=note.text;
    textTd.className="note-text";

    tr.append(fileTd,pageTd,textTd);
    noteBody.append(tr);
  }
}

async function searchPdfNotes(){
  if(!rootHandle)return;

  const button=$("noteSearchBtn");
  const progress=$("noteSearchStatus");
  const resultCount=$("noteResultCount");
  const query=$("noteQuery").value.trim();

  try{
    button.disabled=true;
    progress.classList.remove("search-error");
    if(!pdfs.length)await scanPdfs();
    resultCount.textContent="검색 중...";

    const {results,errors}=await PdfNoteSearch.search(
      pdfs,
      query,
      ({current,total,found,item})=>{
        progress.textContent=`PDF ${current}/${total} 확인 중 · 현재 메모 ${found}개 발견 · ${item.name}`;
      }
    );

    renderNoteResults(results);
    resultCount.textContent=`메모 ${results.length}개`;
    progress.textContent=query
      ? `"${query}" 검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`
      : `검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`;

    if(errors.length){
      progress.textContent+=` · 읽지 못한 PDF ${errors.length}개`;
      progress.classList.add("search-error");
    }
  }catch(error){
    console.error(error);
    progress.textContent=`메모 검색 실패: ${error.message}`;
    progress.classList.add("search-error");
    alert(`메모 검색 실패: ${error.message}`);
  }finally{
    button.disabled=false;
  }
}


$("downloadFolderBtn").onclick=chooseDownloadLocation;
$("pdfLinkBtn").onclick=linkPdfToSelectedRow;
$("pdfOpenBtn").onclick=openPdfForSelectedRow;

$("paperFindBtn").onclick=findInSheet;
$("paperSearchBox").addEventListener("keydown",event=>{
  if(event.key==="Enter")findInSheet();
});

$("noteSearchBtn").onclick=searchPdfNotes;
$("noteQuery").addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!$("noteSearchBtn").disabled)searchPdfNotes();
});

$("addPaperBtn").onclick=async()=>{
  await saveNow().catch(()=>{});

  const u=new URL("./paper-add/index.html",location.href);

  const popupWidth=980;
  const popupHeight=860;
  const parentLeft=Number.isFinite(window.screenX) ? window.screenX : window.screenLeft;
  const parentTop=Number.isFinite(window.screenY) ? window.screenY : window.screenTop;
  const parentWidth=window.outerWidth || document.documentElement.clientWidth || popupWidth;
  const parentHeight=window.outerHeight || document.documentElement.clientHeight || popupHeight;

  // 현재 파란 논문 창의 가로 중앙에 맞추고,
  // 세로 위치는 현재 창 상단에서 약 10% 내려온 곳에 둔다.
  const left=Math.round(parentLeft+(parentWidth-popupWidth)/2);
  const top=Math.round(parentTop+parentHeight*0.10);

  window.open(
    u.toString(),
    "paran-paper-add",
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
};


$("excelImportBtn").onclick=importExcelReferences;
$("referenceFormatBtn").onclick=openReferenceFormatManager;
$("referenceOutputBtn").onclick=openReferenceOutput;

$("aiSettingsBtn").onclick=openAiSettings;

$("aiSettingsSaveBtn").onclick=saveAiSettings;

$("aiSettingsCloseBtn").onclick=()=>{
  $("aiSettingsDialog").close();
};

$("aiSettingsCancelBtn").onclick=()=>{
  $("aiSettingsDialog").close();
};

$("aiSettingsDialog").addEventListener("click",event=>{
  if(event.target===$("aiSettingsDialog")){
    $("aiSettingsDialog").close();
  }
});

$("chooseBtn").onclick=async()=>{
  try{
    const handle=await showDirectoryPicker({id:"paper-library-root",mode:"readwrite"});
    await connectFolder(handle,true);
  }catch(error){
    if(error.name!=="AbortError")alert(error.message);
  }
};

window.addEventListener("message",event=>{
  if(event.origin===location.origin && event.data?.type==="paran-paper-added"){
    reloadDataFile().catch(console.error);
  }
});

try{
  const channel=new BroadcastChannel("paran-paper-data");
  channel.onmessage=event=>{
    if(event.data?.type==="papers-updated")reloadDataFile().catch(console.error);
  };
}catch(_error){}

window.addEventListener("beforeunload",()=>{
  try{ParanPaperSheet.flush();}catch(_e){}
});

(async()=>{
  markDownloadLocation(false);

  const saved=await loadRootHandle();
  if(saved){
    rootHandle=saved;
    if(await ensurePermission(saved,"readwrite",false)){
      await connectFolder(saved,false);
    }else{
      setFolderInfo(`현재 폴더: ${saved.name} · 다시 선택 필요`,"warning");
      setFolderReady(false);
    }
  }
})().catch(error=>{
  console.error(error);
  alert(error.message);
});
