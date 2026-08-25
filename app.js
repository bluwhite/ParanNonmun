
let rootHandle = null;
let pdfItems = [];

const $ = id => document.getElementById(id);
const chooseBtn = $("chooseBtn");
const reopenBtn = $("reopenBtn");
const scanBtn = $("scanBtn");
const searchBox = $("searchBox");
const pdfBody = $("pdfBody");
const statusEl = $("status");
const secureState = $("secureState");
const apiState = $("apiState");
const folderState = $("folderState");
const pdfState = $("pdfState");
const apiBadge = $("apiBadge");
const pathInput = $("pathInput");
const openPathBtn = $("openPathBtn");
const copyLinkBtn = $("copyLinkBtn");
const linkPreview = $("linkPreview");

function setStatus(msg){ statusEl.textContent = msg; }

function updateEnvironment(){
  const secure = window.isSecureContext;
  const supported = "showDirectoryPicker" in window;
  secureState.textContent = secure ? "정상(HTTPS)" : "아님";
  apiState.textContent = supported ? "지원됨" : "지원 안 됨";
  if(secure && supported){
    apiBadge.textContent = "Chrome/Edge 사용 가능";
    apiBadge.className = "badge ok";
  }else{
    apiBadge.textContent = "환경 확인 필요";
    apiBadge.className = "badge bad";
  }
}

function formatBytes(bytes){
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024**2) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1024**2).toFixed(1) + " MB";
}
function normalizePath(path){ return path.replaceAll("\\","/").replace(/^\/+/,""); }

function pageBaseUrl(){
  return new URL("./", location.href);
}
function updateLinkPreview(){
  const value = pathInput.value.trim() || "AI/kim2026.pdf";
  const url = pageBaseUrl();
  url.searchParams.set("file", normalizePath(value));
  linkPreview.textContent = url.toString();
}
pathInput.addEventListener("input", updateLinkPreview);

function openDb(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open("paper-folder-test",1);
    req.onupgradeneeded = ()=>{
      if(!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles");
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
async function saveHandle(handle){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction("handles","readwrite");
    tx.objectStore("handles").put(handle,"root");
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
}
async function loadHandle(){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction("handles","readonly");
    const req = tx.objectStore("handles").get("root");
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}
async function ensureReadPermission(handle, mayPrompt=true){
  if(!handle) return false;
  const options = {mode:"read"};
  if(await handle.queryPermission(options) === "granted") return true;
  if(!mayPrompt) return false;
  return await handle.requestPermission(options) === "granted";
}

async function walkDirectory(dirHandle,prefix=""){
  const items=[];
  for await(const [name,handle] of dirHandle.entries()){
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if(handle.kind === "directory"){
      items.push(...await walkDirectory(handle,relativePath));
    }else if(handle.kind === "file" && name.toLowerCase().endsWith(".pdf")){
      const file = await handle.getFile();
      items.push({name,path:relativePath,size:file.size,handle});
    }
  }
  return items;
}

async function scanPdfs({mayPrompt=true}={}){
  if(!rootHandle) return false;
  const ok = await ensureReadPermission(rootHandle,mayPrompt);
  if(!ok){
    setStatus('저장된 폴더는 있지만 접근 권한 확인이 필요합니다. "이전 폴더 다시 열기"를 눌러 주세요.');
    return false;
  }
  folderState.textContent = rootHandle.name;
  setStatus(`"${rootHandle.name}" 폴더를 검색하는 중...`);
  pdfItems = await walkDirectory(rootHandle);
  pdfItems.sort((a,b)=>a.path.localeCompare(b.path,"ko"));
  pdfState.textContent = `${pdfItems.length}개`;
  scanBtn.disabled = false;
  setStatus(`"${rootHandle.name}"에서 PDF ${pdfItems.length}개를 찾았습니다.`);
  renderTable();
  return true;
}

function renderTable(){
  const q = searchBox.value.trim().toLowerCase();
  const filtered = pdfItems.filter(item =>
    item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
  );
  pdfBody.replaceChildren();

  if(!filtered.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=4; td.className="empty";
    td.textContent = pdfItems.length ? "검색 결과가 없습니다." : "PDF가 없습니다.";
    tr.appendChild(td); pdfBody.appendChild(tr); return;
  }

  for(const item of filtered){
    const tr=document.createElement("tr");
    const tdName=document.createElement("td"); tdName.textContent=item.name;
    const tdPath=document.createElement("td"); tdPath.textContent=item.path; tdPath.className="path";
    const tdSize=document.createElement("td"); tdSize.textContent=formatBytes(item.size);
    const tdAction=document.createElement("td");
    const btn=document.createElement("button"); btn.textContent="PDF 보기"; btn.className="open-btn";
    btn.addEventListener("click",()=>openPdf(item.handle));
    tdAction.appendChild(btn);
    tr.append(tdName,tdPath,tdSize,tdAction); pdfBody.appendChild(tr);
  }
}
searchBox.addEventListener("input",renderTable);

async function openPdf(fileHandle){
  try{
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    const win = window.open(url,"_blank");
    if(!win){ alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요."); return; }
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(err){
    console.error(err);
    alert("PDF를 열지 못했습니다: " + err.message);
  }
}

async function openRelativePath(relativePath){
  const normalized = normalizePath(relativePath);
  if(!normalized){ alert("상대경로를 입력해 주세요."); return; }
  if(!rootHandle){ setStatus("먼저 논문 폴더를 선택해 주세요."); return; }
  if(!pdfItems.length){
    const scanned = await scanPdfs({mayPrompt:true});
    if(!scanned) return;
  }
  const found = pdfItems.find(item => normalizePath(item.path) === normalized);
  if(!found){ setStatus(`찾지 못했습니다: ${normalized}`); return; }
  setStatus(`찾았습니다: ${normalized}`);
  await openPdf(found.handle);
}

chooseBtn.addEventListener("click", async()=>{
  if(!("showDirectoryPicker" in window)){
    alert("최신 Chrome 또는 Edge에서 사용해 주세요.");
    return;
  }
  try{
    rootHandle = await window.showDirectoryPicker({id:"paper-library-root",mode:"read"});
    await saveHandle(rootHandle);
    await scanPdfs({mayPrompt:true});
    const queryPath = new URLSearchParams(location.search).get("file");
    if(queryPath){ pathInput.value=queryPath; updateLinkPreview(); }
  }catch(err){
    if(err.name !== "AbortError") alert("폴더를 열지 못했습니다: " + err.message);
  }
});

reopenBtn.addEventListener("click", async()=>{
  try{
    rootHandle = await loadHandle();
    if(!rootHandle){ alert('저장된 폴더가 없습니다. 먼저 "논문 폴더 선택"을 눌러 주세요.'); return; }
    await scanPdfs({mayPrompt:true});
  }catch(err){
    alert("이전 폴더를 다시 열지 못했습니다: " + err.message);
  }
});

scanBtn.addEventListener("click",()=>scanPdfs({mayPrompt:true}));
openPathBtn.addEventListener("click",()=>openRelativePath(pathInput.value));

copyLinkBtn.addEventListener("click",async()=>{
  updateLinkPreview();
  try{
    await navigator.clipboard.writeText(linkPreview.textContent);
    setStatus("테스트 링크를 클립보드에 복사했습니다.");
  }catch{
    alert("링크 복사에 실패했습니다.");
  }
});

(async function init(){
  updateEnvironment();
  const queryPath = new URLSearchParams(location.search).get("file");
  if(queryPath){ pathInput.value=queryPath; }
  updateLinkPreview();

  try{
    const saved = await loadHandle();
    if(!saved) return;
    rootHandle = saved;
    folderState.textContent = saved.name;
    const hasPermission = await ensureReadPermission(saved,false);
    if(hasPermission){
      await scanPdfs({mayPrompt:false});
    }else{
      setStatus(`이전에 선택한 폴더 "${saved.name}"가 저장되어 있습니다. "이전 폴더 다시 열기"를 눌러 주세요.`);
    }
  }catch(err){ console.error(err); }
})();
