let rootHandle=null;
let pdfs=[];
let dataStore=null;
let paperData={columns:[],papers:[]};
let saveTimer=null;
let saveGeneration=0;
let draggedColumnId=null;

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
      out.push({
        name,
        path,
        size:f.size,
        handle:h
      });
    }
  }

  return out;
}

function setFolderReady(ready){
  $("scanBtn").disabled=!ready;
  $("noteSearchBtn").disabled=!ready;
  $("addPaperBtn").disabled=!ready;
  $("addColumnBtn").disabled=!ready;
}

function setSaveState(text,kind=""){
  const el=$("saveState");
  el.textContent=text;
  el.className=`save-state ${kind}`.trim();
}

async function openDataFile(){
  dataStore=new ParanPaperData.PaperDataStore(rootHandle);
  const {data,created,migrated}=await dataStore.open();

  paperData=data;

  let suffix="";
  if(created)suffix=" · 새로 생성";
  else if(migrated)suffix=" · 새 형식으로 자동 변환";

  $("dataFileStatus").textContent=
    `데이터 파일: ${ParanPaperData.DATA_FILE_NAME}${suffix}`;

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

      if(generation===saveGeneration){
        setSaveState("저장됨","saved");
      }
    }catch(error){
      console.error(error);
      setSaveState(
        `저장 실패: ${error.message}`,
        "error"
      );
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
    setSaveState(
      `저장 실패: ${error.message}`,
      "error"
    );
    throw error;
  }
}

function getColumns(){
  return Array.isArray(paperData.columns)
    ? paperData.columns
    : [];
}

function getPaperValue(paper,column){
  if(column.system){
    return paper[column.field] ?? "";
  }

  if(!paper.custom || typeof paper.custom!=="object"){
    paper.custom={};
  }

  return paper.custom[column.id] ?? "";
}

function setPaperValue(paper,column,value){
  const text=String(value ?? "");

  if(column.system){
    paper[column.field]=text;
    return;
  }

  if(!paper.custom || typeof paper.custom!=="object"){
    paper.custom={};
  }

  paper.custom[column.id]=text;
}

function paperSearchText(paper){
  return getColumns()
    .map(column=>getPaperValue(paper,column))
    .join(" ")
    .toLocaleLowerCase();
}

function buildHeader(){
  const head=$("paperHead");
  head.replaceChildren();

  const tr=document.createElement("tr");

  for(const column of getColumns()){
    const th=document.createElement("th");

    th.textContent=column.name;
    th.dataset.columnId=column.id;
    th.draggable=true;
    th.className=column.system
      ? "paper-column system-column"
      : "paper-column custom-column";

    th.title=column.system
      ? "드래그해서 열 순서 변경"
      : "사용자 열 · 드래그해서 열 순서 변경";

    th.addEventListener("dragstart",event=>{
      draggedColumnId=column.id;
      th.classList.add("dragging");

      if(event.dataTransfer){
        event.dataTransfer.effectAllowed="move";
        event.dataTransfer.setData(
          "text/plain",
          column.id
        );
      }
    });

    th.addEventListener("dragend",()=>{
      draggedColumnId=null;

      document
        .querySelectorAll(".paper-column")
        .forEach(el=>
          el.classList.remove(
            "dragging",
            "drop-before",
            "drop-after"
          )
        );
    });

    th.addEventListener("dragover",event=>{
      event.preventDefault();

      if(!draggedColumnId || draggedColumnId===column.id){
        return;
      }

      const rect=th.getBoundingClientRect();
      const before=
        event.clientX < rect.left+rect.width/2;

      th.classList.toggle(
        "drop-before",
        before
      );

      th.classList.toggle(
        "drop-after",
        !before
      );
    });

    th.addEventListener("dragleave",()=>{
      th.classList.remove(
        "drop-before",
        "drop-after"
      );
    });

    th.addEventListener("drop",async event=>{
      event.preventDefault();

      const fromId=
        draggedColumnId ||
        event.dataTransfer?.getData("text/plain");

      if(!fromId || fromId===column.id)return;

      const columns=getColumns();
      const fromIndex=
        columns.findIndex(c=>c.id===fromId);
      const targetIndex=
        columns.findIndex(c=>c.id===column.id);

      if(fromIndex<0 || targetIndex<0)return;

      const rect=th.getBoundingClientRect();
      const before=
        event.clientX < rect.left+rect.width/2;

      const [moved]=columns.splice(fromIndex,1);

      let insertIndex=
        columns.findIndex(c=>c.id===column.id);

      if(insertIndex<0){
        insertIndex=columns.length;
      }else if(!before){
        insertIndex++;
      }

      columns.splice(insertIndex,0,moved);

      renderPapers();

      try{
        await saveNow();
      }catch(_error){}
    });

    tr.append(th);
  }

  head.append(tr);
}

function createEditor(paper,column){
  const editor=document.createElement("div");

  editor.className="edit-cell";
  editor.contentEditable="true";
  editor.spellcheck=false;
  editor.dataset.columnId=column.id;
  editor.dataset.system=
    column.system ? "true" : "false";

  editor.textContent=
    getPaperValue(paper,column);

  editor.addEventListener("input",()=>{
    setPaperValue(
      paper,
      column,
      editor.innerText
        .replace(/\r?\n/g," ")
        .trimStart()
    );

    scheduleSave();
  });

  editor.addEventListener("blur",()=>{
    const value=
      editor.innerText
        .replace(/\r?\n/g," ")
        .trim();

    setPaperValue(paper,column,value);
    editor.textContent=value;

    saveNow().catch(()=>{});
  });

  editor.addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey){
      event.preventDefault();
      editor.blur();
    }
  });

  return editor;
}

function renderPapers(){
  buildHeader();

  const body=$("paperBody");
  const query=
    $("paperSearchBox")
      .value
      .trim()
      .toLocaleLowerCase();

  body.replaceChildren();

  const visible=
    paperData.papers.filter(
      paper=>
        !query ||
        paperSearchText(paper).includes(query)
    );

  $("paperCount").textContent=
    `논문 ${visible.length}편${
      query
        ? ` / 전체 ${paperData.papers.length}편`
        : ""
    }`;

  const columnCount=
    Math.max(1,getColumns().length);

  if(!visible.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");

    td.colSpan=columnCount;
    td.className="empty";
    td.textContent=
      paperData.papers.length
        ? "검색 결과가 없습니다."
        : "등록된 논문이 없습니다. '논문 추가'를 눌러 RIS를 가져오세요.";

    tr.append(td);
    body.append(tr);
    return;
  }

  for(const paper of visible){
    const tr=document.createElement("tr");

    tr.className="paper-row";
    tr.dataset.id=paper.id;

    for(const column of getColumns()){
      const td=document.createElement("td");

      td.dataset.columnId=column.id;
      td.className=
        column.system
          ? "system-cell"
          : "custom-cell";

      td.append(
        createEditor(paper,column)
      );

      tr.append(td);
    }

    body.append(tr);
  }
}

function addColumn(){
  if(!dataStore)return;

  const raw=window.prompt(
    "추가할 열 이름을 입력하세요."
  );

  if(raw===null)return;

  const name=
    String(raw)
      .normalize("NFKC")
      .trim();

  if(!name){
    alert("열 이름을 입력하세요.");
    return;
  }

  if(
    ParanPaperData.hasDuplicateColumnName(
      getColumns(),
      name
    )
  ){
    const existing=
      getColumns().find(
        column=>
          ParanPaperData.normalizeColumnName(
            column.name
          )===
          ParanPaperData.normalizeColumnName(
            name
          )
      );

    alert(
      `이미 "${existing?.name || name}" 열이 있습니다.\n`+
      "같은 이름의 열은 추가할 수 없습니다."
    );
    return;
  }

  const column=
    ParanPaperData.createCustomColumn(name);

  paperData.columns.push(column);

  for(const paper of paperData.papers){
    if(!paper.custom || typeof paper.custom!=="object"){
      paper.custom={};
    }

    paper.custom[column.id]="";
  }

  renderPapers();
  saveNow().catch(()=>{});
}

async function scanPdfs(){
  pdfs=await walk(rootHandle);
  pdfs.sort(
    (a,b)=>
      a.path.localeCompare(b.path,"ko")
  );

  $("noteSearchStatus").textContent=
    `PDF ${pdfs.length}개 준비됨 · 메모 검색 가능`;
}

async function connectFolder(
  handle,
  mayPrompt=true
){
  rootHandle=handle;

  if(
    !await ensurePermission(
      rootHandle,
      "readwrite",
      mayPrompt
    )
  ){
    status.textContent=
      "폴더 읽기/쓰기 권한이 필요합니다.";

    setFolderReady(false);
    return;
  }

  await saveRootHandle(rootHandle);

  status.textContent=
    `"${rootHandle.name}" 연결 중...`;

  await openDataFile();

  setFolderReady(true);

  status.textContent=
    `"${rootHandle.name}" 폴더 연결 완료`;

  scanPdfs().catch(error=>{
    console.error(error);

    $("noteSearchStatus").textContent=
      `PDF 검색 오류: ${error.message}`;
  });
}

function openPdf(path,page=null){
  const u=
    new URL(
      "./pdf-editor/index.html",
      location.href
    );

  u.searchParams.set("file",path);

  if(page){
    u.searchParams.set("page",page);
  }

  window.open(
    u.toString(),
    "_blank"
  );
}

function renderNoteResults(results){
  const noteBody=$("noteBody");
  noteBody.replaceChildren();

  if(!results.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");

    td.colSpan=3;
    td.className="empty";
    td.textContent=
      "일치하는 메모가 없습니다.";

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
    fileBtn.onclick=
      ()=>openPdf(
        note.path,
        note.page
      );

    fileTd.append(fileBtn);

    pageTd.textContent=note.page;
    pageTd.className="note-page";

    textTd.textContent=note.text;
    textTd.className="note-text";

    tr.append(
      fileTd,
      pageTd,
      textTd
    );

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
    progress.classList.remove(
      "search-error"
    );

    if(!pdfs.length){
      await scanPdfs();
    }

    resultCount.textContent="검색 중...";

    const {results,errors}=
      await PdfNoteSearch.search(
        pdfs,
        query,
        ({
          current,
          total,
          found,
          item
        })=>{
          progress.textContent=
            `PDF ${current}/${total} 확인 중 · `+
            `현재 메모 ${found}개 발견 · `+
            item.name;
        }
      );

    renderNoteResults(results);

    resultCount.textContent=
      `메모 ${results.length}개`;

    progress.textContent=
      query
        ? `"${query}" 검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`
        : `검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`;

    if(errors.length){
      progress.textContent+=
        ` · 읽지 못한 PDF ${errors.length}개`;

      progress.classList.add(
        "search-error"
      );
    }
  }catch(error){
    console.error(error);

    progress.textContent=
      `메모 검색 실패: ${error.message}`;

    progress.classList.add(
      "search-error"
    );

    alert(
      `메모 검색 실패: ${error.message}`
    );
  }finally{
    button.disabled=false;
  }
}

$("paperSearchBox")
  .addEventListener(
    "input",
    renderPapers
  );

$("addColumnBtn").onclick=addColumn;

$("noteSearchBtn").onclick=
  searchPdfNotes;

$("noteQuery")
  .addEventListener(
    "keydown",
    event=>{
      if(
        event.key==="Enter" &&
        !$("noteSearchBtn").disabled
      ){
        searchPdfNotes();
      }
    }
  );

$("addPaperBtn").onclick=async()=>{
  await saveNow().catch(()=>{});

  const u=
    new URL(
      "./paper-add/index.html",
      location.href
    );

  window.open(
    u.toString(),
    "paran-paper-add",
    "width=980,height=860,resizable=yes,scrollbars=yes"
  );
};

$("chooseBtn").onclick=async()=>{
  try{
    const handle=
      await showDirectoryPicker({
        id:"paper-library-root",
        mode:"readwrite"
      });

    await connectFolder(
      handle,
      true
    );
  }catch(error){
    if(error.name!=="AbortError"){
      alert(error.message);
    }
  }
};

$("reopenBtn").onclick=async()=>{
  const handle=await loadRootHandle();

  if(!handle){
    return alert(
      "저장된 폴더가 없습니다."
    );
  }

  await connectFolder(
    handle,
    true
  );
};

$("scanBtn").onclick=async()=>{
  try{
    await saveNow();
    await reloadDataFile();
    await scanPdfs();

    status.textContent=
      `"${rootHandle.name}" 폴더를 다시 읽었습니다.`;
  }catch(error){
    alert(error.message);
  }
};

window.addEventListener(
  "message",
  event=>{
    if(
      event.origin===location.origin &&
      event.data?.type==="paran-paper-added"
    ){
      reloadDataFile()
        .catch(console.error);
    }
  }
);

try{
  const channel=
    new BroadcastChannel(
      "paran-paper-data"
    );

  channel.onmessage=event=>{
    if(
      event.data?.type==="papers-updated"
    ){
      reloadDataFile()
        .catch(console.error);
    }
  };
}catch(_error){}

(async()=>{
  const saved=
    await loadRootHandle();

  if(saved){
    rootHandle=saved;

    if(
      await ensurePermission(
        saved,
        "readwrite",
        false
      )
    ){
      await connectFolder(
        saved,
        false
      );
    }else{
      status.textContent=
        `이전에 선택한 폴더 "${saved.name}"가 저장되어 있습니다. `+
        "'이전 폴더 다시 열기'를 눌러 주세요.";

      setFolderReady(false);
    }
  }
})().catch(error=>{
  console.error(error);
  alert(error.message);
});
