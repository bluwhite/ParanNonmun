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
    "noteSearchBtn","addPaperBtn","paperFindBtn"
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
    onStatus:setSaveState
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
