let rootHandle=null;
let downloadHandle=null;
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
    "pdfLinkBtn","pdfOpenBtn"
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


function markDownloadFolder(handle,permission=""){
  const button=$("downloadFolderBtn");
  if(!button)return;

  const configured=!!handle;
  button.classList.toggle("configured",configured);

  if(!configured){
    button.textContent="다운로드 폴더";
    button.title="PDF를 내려받는 폴더를 지정합니다.";
    return;
  }

  button.textContent="다운로드 폴더 ✓";
  button.title=permission==="granted"
    ? `다운로드 폴더: ${handle.name}`
    : `다운로드 폴더: ${handle.name} · 사용 시 권한을 다시 요청할 수 있습니다.`;
}

async function refreshDownloadFolder(){
  downloadHandle=await loadDownloadHandle();

  if(!downloadHandle){
    markDownloadFolder(null);
    return null;
  }

  let permission="";
  try{
    permission=await downloadHandle.queryPermission({mode:"readwrite"});
  }catch(_error){}

  markDownloadFolder(downloadHandle,permission);
  return downloadHandle;
}

async function chooseDownloadFolder(){
  if(typeof window.showDirectoryPicker!=="function"){
    alert(
      "현재 브라우저에서는 폴더 선택 기능을 사용할 수 없습니다. Chrome 또는 Edge 최신 버전을 사용하세요."
    );
    return null;
  }

  try{
    const handle=await showDirectoryPicker({
      id:"paran-paper-download-folder",
      mode:"readwrite",
      startIn:"downloads"
    });

    if(!await ensurePermission(handle,"readwrite",true)){
      throw new Error("다운로드 폴더 쓰기 권한이 필요합니다.");
    }

    downloadHandle=handle;
    await saveDownloadHandle(handle);
    markDownloadFolder(handle,"granted");

    setSaveState(
      `다운로드 폴더: ${handle.name}`,
      "saved"
    );

    return handle;
  }catch(error){
    if(error?.name==="AbortError")return null;

    console.error(error);
    setSaveState(
      `다운로드 폴더 오류: ${error.message}`,
      "error"
    );
    alert(`다운로드 폴더 오류: ${error.message}`);
    return null;
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
    // 파일 선택창을 열기 전에 현재 선택 행과 논문명을 동기적으로 확인한다.
    // 그래야 브라우저의 사용자 활성화가 파일 선택창까지 유지된다.
    context=selectedPaperContext();

    const title=String(context.title||"").trim();
    if(!title){
      failPdfAction(
        "PDF 연결 실패: 선택한 행에 논문명이 없습니다."
      );
      return;
    }

    if(!downloadHandle){
      failPdfAction(
        "PDF 연결 실패: 먼저 상단의 '다운로드 폴더' 버튼으로 폴더를 지정하세요."
      );
      return;
    }

    if(
      !await ensurePermission(
        downloadHandle,
        "readwrite",
        true
      )
    ){
      failPdfAction(
        "PDF 연결 실패: 다운로드 폴더 접근 권한이 필요합니다."
      );
      return;
    }

    const selected=
      await ParanPdfLink.pickPdfFromDownloadFolder(
        downloadHandle
      );

    if(!selected)return;

    setSaveState("PDF를 논문 폴더로 복사 중...","saving");

    const copied=
      await ParanPdfLink.copyPdfToLibrary(
        selected.fileHandle,
        rootHandle,
        title
      );

    // PDF 열에는 확장자를 제외한 실제 새 파일명만 기록.
    try{
      await ParanPaperSheet.setSystemFieldAtRow(
        context.rowIndex,
        "pdf",
        copied.baseName
      );
    }catch(error){
      // 시트 연결에 실패하면 다운로드 원본은 그대로 두고
      // 새로 만든 대상 파일만 정리한다.
      try{
        await rootHandle.removeEntry(copied.fileName);
      }catch(_e){}
      throw error;
    }

    const sourceDeleted=
      await ParanPdfLink.removeSourceFile(
        downloadHandle,
        selected.fileName
      );

    await scanPdfs();

    if(sourceDeleted){
      setSaveState(
        `PDF 연결 완료: ${copied.fileName}`,
        "saved"
      );
    }else{
      setSaveState(
        `PDF 연결 완료: ${copied.fileName} · 다운로드 폴더의 원본은 삭제하지 못했습니다.`,
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

    // 새 창을 먼저 열어 popup 차단을 피한 뒤 PDF 목록을 다시 확인한다.
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


$("downloadFolderBtn").onclick=chooseDownloadFolder;
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
  await refreshDownloadFolder();

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
