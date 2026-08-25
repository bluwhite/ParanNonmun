
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let rootHandle,fileHandle,parentHandle,fileName,relativePath,originalBytes,pdfDoc;
let zoom=1.25,tool='highlight',dirty=false;
const pending={}; // pageNo -> [{type,x,y,w,h,text}]
const rendered=new Map(); // pageNo -> {wrap,base,overlay,page,height,width}
let history=[];

const $=id=>document.getElementById(id);
const fileNameEl=$('fileName'),filePathEl=$('filePath'),statusEl=$('status'),pageIndicator=$('pageIndicator');
const pagesEl=$('pages'),scrollArea=$('scrollArea'),highlightBtn=$('highlightBtn'),noteBtn=$('noteBtn'),noteText=$('noteText');
const undoBtn=$('undoBtn'),zoomOutBtn=$('zoomOutBtn'),zoomInBtn=$('zoomInBtn'),zoomText=$('zoomText'),saveBtn=$('saveBtn'),saveCopyBtn=$('saveCopyBtn'),closeBtn=$('closeBtn'),dirtyBadge=$('dirtyBadge');

function setStatus(s){statusEl.textContent=s}
function setDirty(v){dirty=v;dirtyBadge.classList.toggle('hidden',!v)}
function setTool(t){tool=t;highlightBtn.classList.toggle('active',t==='highlight');noteBtn.classList.toggle('active',t==='note');for(const v of rendered.values())v.overlay.style.cursor=t==='highlight'?'crosshair':'copy'}
highlightBtn.onclick=()=>setTool('highlight');noteBtn.onclick=()=>setTool('note');

function addPending(pageNo,a){if(!pending[pageNo])pending[pageNo]=[];pending[pageNo].push(a);history.push({pageNo});setDirty(true);redraw(pageNo)}
function pdfToCanvasRect(a,h){return{x:a.x*zoom,y:h-(a.y+a.h)*zoom,w:a.w*zoom,h:a.h*zoom}}
function canvasPoint(canvas,e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}}
function canvasToPdf(canvas,p){return{x:p.x/zoom,y:(canvas.height-p.y)/zoom}}

async function loadExistingAnnotations(pageNo,pageObj){
  try{
    const anns=await pageObj.getAnnotations({intent:'display'});
    const data=rendered.get(pageNo);
    if(!data)return;
    const ctx=data.overlay.getContext('2d');
    for(const a of anns){
      const subtype=(a.subtype||a.annotationType||'')+'';
      const rect=a.rect;
      if(!rect||rect.length<4)continue;
      const x=Math.min(rect[0],rect[2]),y=Math.min(rect[1],rect[3]),w=Math.abs(rect[2]-rect[0]),h=Math.abs(rect[3]-rect[1]);
      const r=pdfToCanvasRect({x,y,w,h},data.overlay.height);
      if(subtype.toLowerCase().includes('highlight')||a.annotationType===9){
        ctx.save();ctx.fillStyle='rgba(255,235,59,.34)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.restore();
      }else if(subtype.toLowerCase().includes('text')||a.annotationType===1){
        drawNoteIcon(ctx,r.x,r.y,(a.contentsObj&&a.contentsObj.str)||a.contents||'메모');
      }
    }
  }catch(e){console.debug('annotation read skipped',e)}
}

function drawNoteIcon(ctx,x,y,text){
  ctx.save();ctx.fillStyle='#facc15';ctx.strokeStyle='#a16207';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+10,y+10,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#713f12';ctx.font='bold 12px sans-serif';ctx.fillText('!',x+7,y+14);ctx.restore();
}

async function redraw(pageNo){
  const data=rendered.get(pageNo);if(!data)return;
  const ctx=data.overlay.getContext('2d');ctx.clearRect(0,0,data.overlay.width,data.overlay.height);
  await loadExistingAnnotations(pageNo,data.page);
  for(const a of (pending[pageNo]||[])){
    const r=pdfToCanvasRect(a,data.overlay.height);
    if(a.type==='highlight'){
      ctx.save();ctx.fillStyle='rgba(255,235,59,.38)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.restore();
    }else if(a.type==='text'){drawNoteIcon(ctx,r.x,r.y,a.text)}
  }
}

function attachOverlayEvents(pageNo,overlay){
  let start=null,current=null;
  overlay.addEventListener('pointerdown',e=>{
    if(tool!=='highlight')return;
    start=canvasPoint(overlay,e);current=start;overlay.setPointerCapture(e.pointerId);
  });
  overlay.addEventListener('pointermove',e=>{
    if(tool!=='highlight'||!start)return;
    current=canvasPoint(overlay,e);
    redraw(pageNo).then(()=>{
      const ctx=overlay.getContext('2d'),x=Math.min(start.x,current.x),y=Math.min(start.y,current.y),w=Math.abs(current.x-start.x),h=Math.abs(current.y-start.y);
      ctx.save();ctx.fillStyle='rgba(255,235,59,.25)';ctx.strokeStyle='#ca8a04';ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.restore();
    });
  });
  overlay.addEventListener('pointerup',e=>{
    if(tool!=='highlight'||!start)return;
    current=canvasPoint(overlay,e);
    const x1=Math.min(start.x,current.x),x2=Math.max(start.x,current.x),y1=Math.min(start.y,current.y),y2=Math.max(start.y,current.y);
    if(x2-x1>5&&y2-y1>5){
      const bl=canvasToPdf(overlay,{x:x1,y:y2}),tr=canvasToPdf(overlay,{x:x2,y:y1});
      addPending(pageNo,{type:'highlight',x:bl.x,y:bl.y,w:tr.x-bl.x,h:tr.y-bl.y,text:''});
    }
    start=null;current=null;
  });
  overlay.addEventListener('click',e=>{
    if(tool!=='note')return;
    const text=noteText.value.trim();if(!text)return alert('메모 내용을 먼저 입력하세요.');
    const p=canvasPoint(overlay,e),pdf=canvasToPdf(overlay,p);
    addPending(pageNo,{type:'text',x:pdf.x,y:pdf.y,w:20/zoom,h:20/zoom,text});
  });
}

async function renderPage(pageNo,wrap){
  if(rendered.has(pageNo))return;
  const page=await pdfDoc.getPage(pageNo),viewport=page.getViewport({scale:zoom});
  wrap.innerHTML='';
  const label=document.createElement('div');label.className='page-label';label.textContent=pageNo;
  const base=document.createElement('canvas');base.className='base';base.width=Math.floor(viewport.width);base.height=Math.floor(viewport.height);
  const overlay=document.createElement('canvas');overlay.className='overlay';overlay.width=base.width;overlay.height=base.height;
  wrap.style.width=base.width+'px';wrap.style.height=base.height+'px';wrap.append(label,base,overlay);
  rendered.set(pageNo,{wrap,base,overlay,page});
  attachOverlayEvents(pageNo,overlay);
  await page.render({canvasContext:base.getContext('2d'),viewport}).promise;
  await redraw(pageNo);
}

function makePageSlots(){
  pagesEl.innerHTML='';rendered.clear();
  for(let i=1;i<=pdfDoc.numPages;i++){
    const wrap=document.createElement('div');wrap.className='page-wrap';wrap.dataset.page=i;
    const ph=document.createElement('div');ph.className='loading-page';ph.textContent=`${i}페이지`;wrap.append(ph);pagesEl.append(wrap);
  }
  const io=new IntersectionObserver(entries=>{
    for(const e of entries)if(e.isIntersecting)renderPage(Number(e.target.dataset.page),e.target);
  },{root:scrollArea,rootMargin:'1000px 0px'});
  document.querySelectorAll('.page-wrap').forEach(el=>io.observe(el));
}

scrollArea.addEventListener('scroll',()=>{
  const areaTop=scrollArea.getBoundingClientRect().top;
  let best=1,bestDist=Infinity;
  document.querySelectorAll('.page-wrap').forEach(el=>{
    const d=Math.abs(el.getBoundingClientRect().top-areaTop-10);
    if(d<bestDist){bestDist=d;best=Number(el.dataset.page)}
  });
  pageIndicator.textContent=`페이지 ${best} / ${pdfDoc?pdfDoc.numPages:'-'}`;
});

undoBtn.onclick=()=>{
  const last=history.pop();if(!last)return;
  const arr=pending[last.pageNo]||[];arr.pop();setDirty(history.length>0);redraw(last.pageNo);
};

async function rerenderAll(){
  const currentScroll=scrollArea.scrollTop;
  makePageSlots();
  scrollArea.scrollTop=currentScroll;
}

zoomOutBtn.onclick=async()=>{zoom=Math.max(.7,zoom-.15);zoomText.textContent=Math.round(zoom*100)+'%';await rerenderAll()};
zoomInBtn.onclick=async()=>{zoom=Math.min(2.4,zoom+.15);zoomText.textContent=Math.round(zoom*100)+'%';await rerenderAll()};

function pdfDate(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  return `D:${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureAnnotsArray(doc,page){
  const {PDFName,PDFArray}=PDFLib;
  const key=PDFName.of('Annots');
  let arr=page.node.lookupMaybe(key,PDFArray);
  if(!arr){arr=doc.context.obj([]);page.node.set(key,arr)}
  return arr;
}

function addHighlightAnnotation(doc,page,a){
  const {PDFName,PDFNumber,PDFHexString}=PDFLib;
  const x1=a.x,y1=a.y,x2=a.x+a.w,y2=a.y+a.h;
  const dict=doc.context.obj({
    Type:PDFName.of('Annot'),
    Subtype:PDFName.of('Highlight'),
    Rect:doc.context.obj([x1,y1,x2,y2]),
    QuadPoints:doc.context.obj([x1,y2,x2,y2,x1,y1,x2,y1]),
    C:doc.context.obj([1,0.92,0.18]),
    CA:PDFNumber.of(0.35),
    Contents:PDFHexString.fromText(a.text||''),
    M:PDFHexString.fromText(pdfDate()),
    F:PDFNumber.of(4)
  });
  ensureAnnotsArray(doc,page).push(doc.context.register(dict));
}

function addTextAnnotation(doc,page,a){
  const {PDFName,PDFNumber,PDFHexString}=PDFLib;
  const size=22;
  const dict=doc.context.obj({
    Type:PDFName.of('Annot'),
    Subtype:PDFName.of('Text'),
    Rect:doc.context.obj([a.x,a.y,a.x+size,a.y+size]),
    Contents:PDFHexString.fromText(a.text||''),
    Name:PDFName.of('Comment'),
    C:doc.context.obj([1,0.82,0]),
    M:PDFHexString.fromText(pdfDate()),
    F:PDFNumber.of(4),
    Open:doc.context.obj(false)
  });
  ensureAnnotsArray(doc,page).push(doc.context.register(dict));
}

async function buildEditedPdf(){
  const {PDFDocument}=PDFLib;
  const doc=await PDFDocument.load(originalBytes.slice());
  const pages=doc.getPages();
  for(const [pageKey,list] of Object.entries(pending)){
    const page=pages[Number(pageKey)-1];if(!page)continue;
    for(const a of list){
      if(a.type==='highlight')addHighlightAnnotation(doc,page,a);
      else if(a.type==='text')addTextAnnotation(doc,page,a);
    }
  }
  return new Uint8Array(await doc.save());
}

async function reloadAfterSave(bytes){
  originalBytes=bytes;
  pdfDoc=await pdfjsLib.getDocument({data:originalBytes.slice()}).promise;
  for(const k of Object.keys(pending))delete pending[k];
  history=[];setDirty(false);
  await rerenderAll();
}

async function saveOriginal(){
  try{
    saveBtn.disabled=true;setStatus('원본에 저장 중...');
    if(!await ensurePermission(rootHandle,'readwrite',true))throw new Error('쓰기 권한이 없습니다.');
    const bytes=dirty?await buildEditedPdf():originalBytes;
    const w=await fileHandle.createWritable();await w.write(bytes);await w.close();
    await reloadAfterSave(bytes);
    setStatus(`저장 완료: ${relativePath}`);
  }catch(e){console.error(e);alert('저장 실패: '+e.message)}finally{saveBtn.disabled=false}
}

async function saveCopy(){
  try{
    saveCopyBtn.disabled=true;setStatus('복사본 저장 중...');
    if(!await ensurePermission(rootHandle,'readwrite',true))throw new Error('쓰기 권한이 없습니다.');
    const bytes=dirty?await buildEditedPdf():originalBytes;
    const stem=fileName.toLowerCase().endsWith('.pdf')?fileName.slice(0,-4):fileName;
    let candidate=`${stem}_annotated.pdf`,n=2;
    while(true){
      try{await parentHandle.getFileHandle(candidate);candidate=`${stem}_annotated_${n++}.pdf`}
      catch(e){if(e.name==='NotFoundError')break;throw e}
    }
    const h=await parentHandle.getFileHandle(candidate,{create:true}),w=await h.createWritable();await w.write(bytes);await w.close();
    setStatus(`복사본 저장 완료: ${candidate}`);
  }catch(e){console.error(e);alert('복사본 저장 실패: '+e.message)}finally{saveCopyBtn.disabled=false}
}
saveBtn.onclick=saveOriginal;saveCopyBtn.onclick=saveCopy;
closeBtn.onclick=()=>{if(dirty&&!confirm('저장되지 않은 변경 사항이 있습니다. 닫을까요?'))return;window.close()};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

(async()=>{
  try{
    relativePath=new URLSearchParams(location.search).get('file')||'';
    if(!relativePath)throw new Error('PDF 경로가 없습니다.');
    rootHandle=await loadRootHandle();if(!rootHandle)throw new Error('논문 폴더가 연결되지 않았습니다.');
    const r=await getFileHandleFromRelativePath(rootHandle,relativePath);fileHandle=r.fileHandle;parentHandle=r.parentHandle;fileName=r.fileName;
    fileNameEl.textContent=fileName;filePathEl.textContent=relativePath;document.title=fileName+' - PDF 편집';
    const f=await fileHandle.getFile();originalBytes=new Uint8Array(await f.arrayBuffer());
    pdfDoc=await pdfjsLib.getDocument({data:originalBytes.slice()}).promise;
    zoomText.textContent=Math.round(zoom*100)+'%';pageIndicator.textContent=`페이지 1 / ${pdfDoc.numPages}`;
    makePageSlots();setStatus('준비 완료');
  }catch(e){console.error(e);setStatus(e.message);alert(e.message)}
})();
