let rootHandle=null;
let pdfs=[];
let dataStore=null;
let paperData={papers:[]};
let saveTimer=null;
let saveGeneration=0;

const $=id=>document.getElementById(id);
const status=$("status");

$("versionBadge").textContent=`v${APP_VERSION}`;
document.title=`파란 논문 · v${APP_VERSION}`;

const PAPER_COLUMNS=[
  ["check","확인(*)"],["authors","저자"],["year","출판연도"],["title","논문명"],
  ["journal","학술지명"],["volume","권"],["issue","호"],["publisher","학회명"],
  ["startPage","시작페이지"],["endPage","끝페이지"],["memo","메모"],["pdf","PDF"]
];

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
  $("scanBtn").disabled=!ready;
  $("noteSearchBtn").disabled=!ready;
  $("addPaperBtn").disabled=!ready;
}

function setSaveState(text,kind=""){
  const el=$("saveState");
  el.textContent=text;
  el.className=`save-state ${kind}`.trim();
}

async function openDataFile(){
  dataStore=new ParanPaperData.PaperDataStore(rootHandle);
  const {data,created}=await dataStore.open();
  paperData=data;
  $("dataFileStatus").textContent=`데이터 파일: ${ParanPaperData.DATA_FILE_NAME}${created?" · 새로 생성":""}`;
  renderPapers();
  setSaveState("저장됨","saved");
}

async function reloadDataFile(){
  if(!dataStore)return;
  paperData=await dataStore.reload();
  renderPapers();
  setSaveState("저장됨","saved");
}

function scheduleSave(){
  saveGeneration++;
  const generation=saveGeneration;
  clearTimeout(saveTimer);
  setSaveState("저장 중...","saving");
  saveTimer=setTimeout(async()=>{
    try{
      await dataStore.save(paperData);
      if(generation===saveGeneration)setSaveState("저장됨","saved");
    }catch(error){
      console.error(error);
      setSaveState(`저장 실패: ${error.message}`,"error");
    }
  },250);
}

async function saveNow(){
  if(!dataStore)return;
  clearTimeout(saveTimer);
  saveGeneration++;
  setSaveState("저장 중...","saving");
  try{
    await dataStore.save(paperData);
    setSaveState("저장됨","saved");
  }catch(error){
    console.error(error);
    setSaveState(`저장 실패: ${error.message}`,"error");
    throw error;
  }
}

function paperSearchText(paper){
  return PAPER_COLUMNS.map(([field])=>paper[field]||"").join(" ").toLocaleLowerCase();
}

function renderPapers(){
  const body=$("paperBody");
  const query=$("paperSearchBox").value.trim().toLocaleLowerCase();
  body.replaceChildren();

  const visible=paperData.papers.filter(p=>!query||paperSearchText(p).includes(query));
  $("paperCount").textContent=`논문 ${visible.length}편${query?` / 전체 ${paperData.papers.length}편`:""}`;

  if(!visible.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=12;td.className="empty";
    td.textContent=paperData.papers.length?"검색 결과가 없습니다.":"등록된 논문이 없습니다. '논문 추가'를 눌러 RIS를 가져오세요.";
    tr.append(td);body.append(tr);return;
  }

  for(const paper of visible){
    const tr=document.createElement("tr");
    tr.className="paper-row";
    tr.dataset.id=paper.id;

    for(const [field] of PAPER_COLUMNS){
      const td=document.createElement("td");
      const editor=document.createElement("div");
      editor.className="edit-cell";
      editor.contentEditable="true";
      editor.spellcheck=false;
      editor.dataset.field=field;
      editor.textContent=paper[field]||"";
      editor.addEventListener("input",()=>{
        paper[field]=editor.innerText.replace(/\r?\n/g," ").trimStart();
        scheduleSave();
      });
      editor.addEventListener("blur",()=>{
        paper[field]=editor.innerText.replace(/\r?\n/g," ").trim();
        editor.textContent=paper[field];
        saveNow().catch(()=>{});
      });
      editor.addEventListener("keydown",e=>{
        if(e.key==="Enter"&&!e.shiftKey){
          e.preventDefault();editor.blur();
        }
      });
      td.append(editor);tr.append(td);
    }
    body.append(tr);
  }
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
    setFolderReady(false);return;
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
    const tr=document.createElement("tr"),td=document.createElement("td");
    td.colSpan=3;td.className="empty";td.textContent="일치하는 메모가 없습니다.";
    tr.append(td);noteBody.append(tr);return;
  }
  for(const note of results){
    const tr=document.createElement("tr"),fileTd=document.createElement("td"),pageTd=document.createElement("td"),textTd=document.createElement("td");
    const fileBtn=document.createElement("button");
    fileBtn.className="note-file";fileBtn.textContent=note.name;fileBtn.title=note.path;fileBtn.onclick=()=>openPdf(note.path,note.page);
    fileTd.append(fileBtn);pageTd.textContent=note.page;pageTd.className="note-page";textTd.textContent=note.text;textTd.className="note-text";
    tr.append(fileTd,pageTd,textTd);noteBody.append(tr);
  }
}

async function searchPdfNotes(){
  if(!rootHandle)return;
  const button=$("noteSearchBtn"),progress=$("noteSearchStatus"),resultCount=$("noteResultCount"),query=$("noteQuery").value.trim();
  try{
    button.disabled=true;progress.classList.remove("search-error");
    if(!pdfs.length)await scanPdfs();
    resultCount.textContent="검색 중...";
    const {results,errors}=await PdfNoteSearch.search(pdfs,query,({current,total,found,item})=>{
      progress.textContent=`PDF ${current}/${total} 확인 중 · 현재 메모 ${found}개 발견 · ${item.name}`;
    });
    renderNoteResults(results);resultCount.textContent=`메모 ${results.length}개`;
    progress.textContent=query?`"${query}" 검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`:`검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`;
    if(errors.length){progress.textContent+=` · 읽지 못한 PDF ${errors.length}개`;progress.classList.add("search-error");}
  }catch(error){
    console.error(error);progress.textContent=`메모 검색 실패: ${error.message}`;progress.classList.add("search-error");alert(`메모 검색 실패: ${error.message}`);
  }finally{button.disabled=false;}
}

$("paperSearchBox").addEventListener("input",renderPapers);
$("noteSearchBtn").onclick=searchPdfNotes;
$("noteQuery").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("noteSearchBtn").disabled)searchPdfNotes();});

$("addPaperBtn").onclick=async()=>{
  await saveNow().catch(()=>{});
  const u=new URL("./paper-add/index.html",location.href);
  window.open(u.toString(),"paran-paper-add","width=980,height=860,resizable=yes,scrollbars=yes");
};

$("chooseBtn").onclick=async()=>{
  try{
    const handle=await showDirectoryPicker({id:"paper-library-root",mode:"readwrite"});
    await connectFolder(handle,true);
  }catch(error){if(error.name!=="AbortError")alert(error.message);}
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
  }catch(error){alert(error.message);}
};

window.addEventListener("message",e=>{
  if(e.origin===location.origin&&e.data?.type==="paran-paper-added")reloadDataFile().catch(console.error);
});

try{
  const channel=new BroadcastChannel("paran-paper-data");
  channel.onmessage=e=>{if(e.data?.type==="papers-updated")reloadDataFile().catch(console.error);};
}catch(_e){}

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
})().catch(error=>{console.error(error);alert(error.message);});
