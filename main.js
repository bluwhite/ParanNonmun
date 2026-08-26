let rootHandle=null;
let pdfs=[];
let dataStore=null;
let paperData={columns:[],papers:[],sheetSnapshot:null};

const $=id=>document.getElementById(id);
const status=$("status");

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
    "scanBtn","noteSearchBtn","addPaperBtn","addColumnBtn",
    "moveColumnLeftBtn","moveColumnRightBtn","paperFindBtn"
  ]){
    $(id).disabled=!ready;
  }
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

  let suffix="";
  if(created)suffix=" · 새로 생성";
  else if(migrated)suffix=" · 새 형식으로 자동 변환";

  $("dataFileStatus").textContent=`데이터 파일: ${ParanPaperData.DATA_FILE_NAME}${suffix}`;
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

async function addColumn(){
  if(!dataStore)return;
  const raw=window.prompt("추가할 열 이름을 입력하세요.");
  if(raw===null)return;
  try{
    await ParanPaperSheet.addColumn(raw);
  }catch(error){
    alert(error.message);
  }
}

async function moveColumn(direction){
  try{
    await ParanPaperSheet.moveSelectedColumn(direction);
  }catch(error){
    alert(error.message);
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
    status.textContent="폴더 읽기/쓰기 권한이 필요합니다.";
    setFolderReady(false);
    return;
  }

  await saveRootHandle(rootHandle);
  status.textContent=`"${rootHandle.name}" 연결 중...`;
  await openDataFile();
  setFolderReady(true);
  status.textContent=`"${rootHandle.name}" 폴더 연결 완료`;

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

$("addColumnBtn").onclick=addColumn;
$("moveColumnLeftBtn").onclick=()=>moveColumn(-1);
$("moveColumnRightBtn").onclick=()=>moveColumn(1);
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
  window.open(u.toString(),"paran-paper-add","width=980,height=860,resizable=yes,scrollbars=yes");
};

$("chooseBtn").onclick=async()=>{
  try{
    const handle=await showDirectoryPicker({id:"paper-library-root",mode:"readwrite"});
    await connectFolder(handle,true);
  }catch(error){
    if(error.name!=="AbortError")alert(error.message);
  }
};

$("reopenBtn").onclick=async()=>{
  const handle=await loadRootHandle();
  if(!handle)return alert("저장된 폴더가 없습니다.");
  await connectFolder(handle,true);
};

$("scanBtn").onclick=async()=>{
  try{
    await saveNow();
    await reloadDataFile();
    await scanPdfs();
    status.textContent=`"${rootHandle.name}" 폴더를 다시 읽었습니다.`;
  }catch(error){
    alert(error.message);
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
      status.textContent=`이전에 선택한 폴더 "${saved.name}"가 저장되어 있습니다. '이전 폴더 다시 열기'를 눌러 주세요.`;
      setFolderReady(false);
    }
  }
})().catch(error=>{
  console.error(error);
  alert(error.message);
});
