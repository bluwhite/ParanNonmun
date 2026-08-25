
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let rootHandle=null;
let fileHandle=null;
let parentHandle=null;
let relativePath='';
let fileName='';
let originalBytes=null;
let pdfDoc=null;
let pageNumber=1;
let zoom=1.25;
let tool='highlight';
let dirty=false;

const annotations={}; // page -> array
let dragStart=null, dragNow=null;

const $=id=>document.getElementById(id);
const fileNameEl=$('fileName'),filePathEl=$('filePath'),statusEl=$('status');
const pdfCanvas=$('pdfCanvas'),overlayCanvas=$('overlayCanvas');
const pageNo=$('pageNo'),pageTotal=$('pageTotal'),zoomText=$('zoomText');
const prevBtn=$('prevBtn'),nextBtn=$('nextBtn');
const zoomOutBtn=$('zoomOutBtn'),zoomInBtn=$('zoomInBtn');
const highlightBtn=$('highlightBtn'),noteBtn=$('noteBtn'),noteText=$('noteText');
const undoBtn=$('undoBtn'),saveBtn=$('saveBtn'),saveCopyBtn=$('saveCopyBtn'),closeBtn=$('closeBtn');
const dirtyBadge=$('dirtyBadge');

function setStatus(msg){statusEl.textContent=msg}
function setDirty(v){
  dirty=v;
  dirtyBadge.classList.toggle('hidden',!v);
}
function pageAnnotations(){
  if(!annotations[pageNumber])annotations[pageNumber]=[];
  return annotations[pageNumber];
}
function setTool(name){
  tool=name;
  highlightBtn.classList.toggle('active',name==='highlight');
  noteBtn.classList.toggle('active',name==='note');
  overlayCanvas.style.cursor=name==='highlight'?'crosshair':'copy';
}
highlightBtn.onclick=()=>setTool('highlight');
noteBtn.onclick=()=>setTool('note');

function canvasPoint(evt){
  const r=overlayCanvas.getBoundingClientRect();
  return {
    x:(evt.clientX-r.left)*(overlayCanvas.width/r.width),
    y:(evt.clientY-r.top)*(overlayCanvas.height/r.height)
  };
}
function canvasToPdf(p){
  return {x:p.x/zoom,y:(overlayCanvas.height-p.y)/zoom};
}
function pdfRectToCanvas(a){
  return {
    x:a.x*zoom,
    y:overlayCanvas.height-(a.y+a.h)*zoom,
    w:a.w*zoom,
    h:a.h*zoom
  };
}

function wrapChars(ctx,text,maxWidth){
  const lines=[];let line='';
  for(const ch of [...text]){
    const test=line+ch;
    if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=ch;}
    else line=test;
  }
  if(line)lines.push(line);
  return lines;
}
function drawNotePreview(ctx,x,y,w,h,text){
  ctx.save();
  ctx.fillStyle='rgba(255,248,196,.97)';
  ctx.strokeStyle='rgba(161,98,7,.9)';
  ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
  ctx.fillStyle='#3f2d00';
  ctx.font='14px system-ui,sans-serif';
  wrapChars(ctx,text,Math.max(20,w-12)).slice(0,6)
    .forEach((line,i)=>ctx.fillText(line,x+6,y+20+i*18));
  ctx.restore();
}
function redrawOverlay(){
  const ctx=overlayCanvas.getContext('2d');
  ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);

  for(const a of (annotations[pageNumber]||[])){
    const r=pdfRectToCanvas(a);
    if(a.type==='highlight'){
      ctx.save();
      ctx.fillStyle='rgba(255,235,59,.38)';
      ctx.fillRect(r.x,r.y,r.w,r.h);
      ctx.restore();
    }else if(a.type==='note'){
      drawNotePreview(ctx,r.x,r.y,r.w,r.h,a.text);
    }
  }

  if(dragStart&&dragNow&&tool==='highlight'){
    const x=Math.min(dragStart.x,dragNow.x);
    const y=Math.min(dragStart.y,dragNow.y);
    const w=Math.abs(dragNow.x-dragStart.x);
    const h=Math.abs(dragNow.y-dragStart.y);
    ctx.save();
    ctx.fillStyle='rgba(255,235,59,.28)';
    ctx.strokeStyle='rgba(202,138,4,.9)';
    ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    ctx.restore();
  }
}

async function renderPage(){
  const page=await pdfDoc.getPage(pageNumber);
  const viewport=page.getViewport({scale:zoom});

  pdfCanvas.width=Math.floor(viewport.width);
  pdfCanvas.height=Math.floor(viewport.height);
  overlayCanvas.width=pdfCanvas.width;
  overlayCanvas.height=pdfCanvas.height;

  await page.render({
    canvasContext:pdfCanvas.getContext('2d'),
    viewport
  }).promise;

  pageNo.textContent=pageNumber;
  pageTotal.textContent=pdfDoc.numPages;
  zoomText.textContent=Math.round(zoom*100)+'%';
  prevBtn.disabled=pageNumber<=1;
  nextBtn.disabled=pageNumber>=pdfDoc.numPages;
  redrawOverlay();
}

overlayCanvas.addEventListener('pointerdown',e=>{
  if(tool!=='highlight')return;
  dragStart=canvasPoint(e);dragNow=dragStart;
  overlayCanvas.setPointerCapture(e.pointerId);
});
overlayCanvas.addEventListener('pointermove',e=>{
  if(tool==='highlight'&&dragStart){
    dragNow=canvasPoint(e);redrawOverlay();
  }
});
overlayCanvas.addEventListener('pointerup',e=>{
  if(tool!=='highlight'||!dragStart)return;
  dragNow=canvasPoint(e);
  const x1=Math.min(dragStart.x,dragNow.x),x2=Math.max(dragStart.x,dragNow.x);
  const y1=Math.min(dragStart.y,dragNow.y),y2=Math.max(dragStart.y,dragNow.y);
  if(x2-x1>5&&y2-y1>5){
    const bl=canvasToPdf({x:x1,y:y2});
    const tr=canvasToPdf({x:x2,y:y1});
    pageAnnotations().push({
      type:'highlight',x:bl.x,y:bl.y,w:tr.x-bl.x,h:tr.y-bl.y
    });
    setDirty(true);
  }
  dragStart=null;dragNow=null;redrawOverlay();
});
overlayCanvas.addEventListener('click',e=>{
  if(tool!=='note')return;
  const text=noteText.value.trim();
  if(!text){alert('메모 내용을 먼저 입력하세요.');return;}

  const p=canvasPoint(e);
  const wC=Math.min(260,Math.max(170,overlayCanvas.width*.28));
  const hC=105;
  let xC=p.x,yC=p.y;
  if(xC+wC>overlayCanvas.width)xC=overlayCanvas.width-wC-5;
  if(yC+hC>overlayCanvas.height)yC=overlayCanvas.height-hC-5;

  const bl=canvasToPdf({x:xC,y:yC+hC});
  pageAnnotations().push({
    type:'note',x:bl.x,y:bl.y,w:wC/zoom,h:hC/zoom,text
  });
  setDirty(true);redrawOverlay();
});

undoBtn.onclick=()=>{
  const arr=annotations[pageNumber]||[];
  if(arr.length){arr.pop();setDirty(true);redrawOverlay();}
};

prevBtn.onclick=async()=>{if(pageNumber>1){pageNumber--;await renderPage();}};
nextBtn.onclick=async()=>{if(pageNumber<pdfDoc.numPages){pageNumber++;await renderPage();}};
zoomOutBtn.onclick=async()=>{zoom=Math.max(.6,zoom-.15);await renderPage();};
zoomInBtn.onclick=async()=>{zoom=Math.min(2.5,zoom+.15);await renderPage();};

async function makeNotePng(text,widthPx=520,heightPx=210){
  const c=document.createElement('canvas');
  c.width=widthPx;c.height=heightPx;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff8c4';ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='#a16207';ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,c.width-3,c.height-3);
  ctx.fillStyle='#3f2d00';
  ctx.font='28px system-ui,-apple-system,"Segoe UI",sans-serif';
  wrapChars(ctx,text,c.width-32).slice(0,6)
    .forEach((line,i)=>ctx.fillText(line,16,42+i*31));
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function buildEditedPdf(){
  const {PDFDocument,rgb}=PDFLib;
  const doc=await PDFDocument.load(originalBytes.slice());
  const pages=doc.getPages();

  for(const [pageKey,list] of Object.entries(annotations)){
    const page=pages[Number(pageKey)-1];
    if(!page)continue;

    for(const a of list){
      if(a.type==='highlight'){
        page.drawRectangle({
          x:a.x,y:a.y,width:a.w,height:a.h,
          color:rgb(1,.92,.18),opacity:.34,borderWidth:0
        });
      }else if(a.type==='note'){
        const png=await makeNotePng(a.text);
        const img=await doc.embedPng(png);
        page.drawImage(img,{
          x:a.x,y:a.y,width:a.w,height:a.h,opacity:.98
        });
      }
    }
  }
  return new Uint8Array(await doc.save());
}

function clearPendingAnnotations(){
  for(const key of Object.keys(annotations))delete annotations[key];
  setDirty(false);
  redrawOverlay();
}

async function saveToOriginal(){
  try{
    saveBtn.disabled=true;
    setStatus('원본 파일에 저장 중...');

    if(!await ensurePermission(rootHandle,'readwrite',true)){
      throw new Error('폴더 쓰기 권한이 없습니다.');
    }

    const bytes=dirty ? await buildEditedPdf() : originalBytes;

    const writable=await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();

    originalBytes=bytes;

    // 방금 저장한 PDF를 다시 불러와 화면에도 즉시 반영한다.
    pdfDoc=await pdfjsLib.getDocument({data:originalBytes.slice()}).promise;

    // 주석은 이제 PDF 본문에 실제로 들어갔으므로 임시 오버레이 목록은 비운다.
    for(const key of Object.keys(annotations)) delete annotations[key];
    setDirty(false);

    // 수정된 PDF 자체를 다시 렌더링해야 저장 직후에도 표시가 그대로 보인다.
    await renderPage();

    setStatus(`저장 완료: ${relativePath}`);
  }catch(e){
    console.error(e);
    alert('원본 저장 실패: '+e.message);
    setStatus('저장하지 못했습니다.');
  }finally{
    saveBtn.disabled=false;
  }
}

async function saveCopy(){
  try{
    saveCopyBtn.disabled=true;
    setStatus('복사본 저장 중...');

    if(!await ensurePermission(rootHandle,'readwrite',true)){
      throw new Error('폴더 쓰기 권한이 없습니다.');
    }

    const bytes=dirty ? await buildEditedPdf() : originalBytes;
    const stem=fileName.toLowerCase().endsWith('.pdf')?fileName.slice(0,-4):fileName;
    let newName=`${stem}_annotated.pdf`;

    // Avoid silently overwriting an existing annotated file by adding a number.
    let candidate=newName, n=2;
    while(true){
      try{
        await parentHandle.getFileHandle(candidate);
        candidate=`${stem}_annotated_${n}.pdf`; n++;
      }catch(err){
        if(err.name==='NotFoundError')break;
        throw err;
      }
    }
    const newHandle=await parentHandle.getFileHandle(candidate,{create:true});
    const writable=await newHandle.createWritable();
    await writable.write(bytes);
    await writable.close();

    setStatus(`복사본 저장 완료: ${candidate}`);
    alert(`같은 폴더에 저장했습니다.\n\n${candidate}`);
  }catch(e){
    console.error(e);
    alert('복사본 저장 실패: '+e.message);
  }finally{
    saveCopyBtn.disabled=false;
  }
}

saveBtn.onclick=saveToOriginal;
saveCopyBtn.onclick=saveCopy;
closeBtn.onclick=()=>{
  if(dirty&&!confirm('저장되지 않은 변경 사항이 있습니다. 목록으로 돌아갈까요?'))return;
  window.close();
};

window.addEventListener('beforeunload',e=>{
  if(dirty){
    e.preventDefault();
    e.returnValue='';
  }
});

(async()=>{
  try{
    relativePath=new URLSearchParams(location.search).get('file')||'';
    if(!relativePath)throw new Error('PDF 경로가 전달되지 않았습니다.');

    rootHandle=await loadRootHandle();
    if(!rootHandle)throw new Error('저장된 논문 폴더가 없습니다. 목록 화면에서 먼저 폴더를 선택하세요.');

    const granted=await ensurePermission(rootHandle,'readwrite',false);
    if(!granted){
      setStatus('폴더 권한 확인이 필요합니다. 저장 버튼을 누르면 권한을 요청할 수 있습니다.');
    }

    const resolved=await getFileHandleFromRelativePath(rootHandle,relativePath);
    fileHandle=resolved.fileHandle;
    parentHandle=resolved.parentHandle;
    fileName=resolved.fileName;

    fileNameEl.textContent=fileName;
    filePathEl.textContent=relativePath;
    document.title=fileName+' - PDF 편집';

    const file=await fileHandle.getFile();
    originalBytes=new Uint8Array(await file.arrayBuffer());
    pdfDoc=await pdfjsLib.getDocument({data:originalBytes.slice()}).promise;

    pageTotal.textContent=pdfDoc.numPages;
    setStatus('준비 완료');
    await renderPage();
  }catch(e){
    console.error(e);
    fileNameEl.textContent='PDF를 열 수 없습니다';
    setStatus(e.message);
    alert(e.message);
  }
})();
