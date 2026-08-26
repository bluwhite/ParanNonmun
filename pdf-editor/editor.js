pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

(async()=>{
  const params=new URLSearchParams(location.search);
  const requestedPage=Math.max(1,Number(params.get('page'))||1);
  let rootHandle,fileHandle,parentHandle,fileName,relativePath,originalBytes,pdfDoc;
  let zoom=1.25,tool='highlight',dirty=false,history=[],editMode=false;
  const pending={},rendered=new Map();
  
  const $=id=>document.getElementById(id);
  const pagesEl=$('pages'),scrollArea=$('scrollArea');
  $('versionBadge').textContent=`v${APP_VERSION}`;
  const status=$('viewerStatus'),dirtyBadge=$('dirtyBadge');
  const editBtn=$('editBtn'),editTools=$('editTools'),modeLabel=$('modeLabel');
  
  function setDirty(v){
    dirty=v;
    dirtyBadge.classList.toggle('hidden',!v);
  }
  
  function setEditMode(on,message=''){
    editMode=on;
    editBtn.classList.toggle('hidden',on);
    editTools.classList.toggle('hidden',!on);
    modeLabel.textContent=on?'편집 모드':'읽기 모드';
    modeLabel.className='mode-label '+(on?'edit':'read');

    for(const x of rendered.values()){
      x.overlay.style.pointerEvents=on?'auto':'none';
      x.overlay.style.cursor=on?(tool==='highlight'?'crosshair':'copy'):'default';

      if(x.textLayer){
        x.textLayer.style.pointerEvents=on?'none':'auto';
        x.textLayer.classList.toggle('selection-disabled',on);
      }
    }

    if(on){
      try{window.getSelection()?.removeAllRanges();}catch(_e){}
    }

    status.textContent=message || (on
      ? '편집 모드 · 형광펜 또는 메모를 사용한 뒤 저장하세요.'
      : '읽기 모드 · 글자를 드래그해서 선택·복사할 수 있습니다.');
  }

  function clearPending(){
    for(const k of Object.keys(pending)) delete pending[k];
    history=[];
    setDirty(false);
  }
  
  function setTool(t){
    tool=t;
    $('highlightBtn').classList.toggle('active',t==='highlight');
    $('noteBtn').classList.toggle('active',t==='note');
  
    for(const x of rendered.values()){
      if(editMode) x.overlay.style.cursor=t==='highlight'?'crosshair':'copy';
    }
  
    status.textContent=t==='highlight'
      ? '편집 모드 · 페이지 위에서 형광 표시할 영역을 드래그하세요.'
      : '편집 모드 · 메모 내용을 입력한 뒤 페이지에서 위치를 클릭하세요.';
  }
  
  editBtn.onclick=()=>setEditMode(true);
  $('highlightBtn').onclick=()=>setTool('highlight');
  $('noteBtn').onclick=()=>setTool('note');
  
  function canvasPoint(canvas,e){
    const r=canvas.getBoundingClientRect();
    return {
      x:(e.clientX-r.left)*(canvas.width/r.width),
      y:(e.clientY-r.top)*(canvas.height/r.height)
    };
  }
  
  function canvasToPdf(canvas,p){
    return {x:p.x/zoom,y:(canvas.height-p.y)/zoom};
  }
  
  function pdfRectToCanvas(a,h){
    return {x:a.x*zoom,y:h-(a.y+a.h)*zoom,w:a.w*zoom,h:a.h*zoom};
  }
  
  function annotationText(a){
    if(a?.contentsObj?.str) return a.contentsObj.str;
    if(typeof a?.contents==='string') return a.contents;
    if(a?.contents?.str) return a.contents.str;
    return '';
  }
  
  function wrapText(ctx,text,maxWidth){
    const lines=[];
    let line='';
    for(const ch of [...(text||'')]){
      const test=line+ch;
      if(line && ctx.measureText(test).width>maxWidth){
        lines.push(line);
        line=ch;
      }else{
        line=test;
      }
    }
    if(line) lines.push(line);
    return lines;
  }
  
  function drawNoteBox(ctx,x,y,text,canvasWidth,canvasHeight){
    const boxW=Math.min(260,Math.max(180,canvasWidth*0.33));
    ctx.save();
    ctx.font='14px system-ui,-apple-system,"Segoe UI",sans-serif';
  
    const lines=wrapText(ctx,text || '(내용 없는 메모)',boxW-40).slice(0,8);
    const boxH=Math.max(50,18+lines.length*18);
  
    let bx=x+10;
    let by=y+10;
    if(bx+boxW>canvasWidth-4) bx=Math.max(4,x-boxW-10);
    if(by+boxH>canvasHeight-4) by=Math.max(4,canvasHeight-boxH-4);
  
    ctx.fillStyle='rgba(255,248,196,.97)';
    ctx.strokeStyle='rgba(161,98,7,.92)';
    ctx.lineWidth=1.4;
    ctx.fillRect(bx,by,boxW,boxH);
    ctx.strokeRect(bx,by,boxW,boxH);
  
    ctx.fillStyle='#facc15';
    ctx.strokeStyle='#a16207';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(bx+15,by+16,8,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
  
    ctx.fillStyle='#713f12';
    ctx.font='bold 11px sans-serif';
    ctx.fillText('!',bx+12,by+20);
  
    ctx.fillStyle='#3f2d00';
    ctx.font='14px system-ui,-apple-system,"Segoe UI",sans-serif';
    lines.forEach((line,i)=>ctx.fillText(line,bx+32,by+22+i*18));
    ctx.restore();
  }
  
  async function redraw(n){
    const d=rendered.get(n);
    if(!d) return;
  
    const ctx=d.overlay.getContext('2d');
    ctx.clearRect(0,0,d.overlay.width,d.overlay.height);
  
    // Existing standard PDF annotations.
    try{
      const anns=await d.page.getAnnotations({intent:'display'});
  
      for(const a of anns){
        if(!a.rect) continue;
  
        const x=Math.min(a.rect[0],a.rect[2]);
        const y=Math.min(a.rect[1],a.rect[3]);
        const w=Math.abs(a.rect[2]-a.rect[0]);
        const h=Math.abs(a.rect[3]-a.rect[1]);
        const r=pdfRectToCanvas({x,y,w,h},d.overlay.height);
  
        if(a.annotationType===9){
          ctx.save();
          ctx.fillStyle='rgba(255,235,59,.30)';
          ctx.fillRect(r.x,r.y,r.w,r.h);
          ctx.restore();
        }else if(a.annotationType===1){
          drawNoteBox(
            ctx,r.x,r.y,annotationText(a),
            d.overlay.width,d.overlay.height
          );
        }
      }
    }catch(e){
      console.debug('기존 주석 표시 생략',e);
    }
  
    // Pending edits.
    for(const a of (pending[n]||[])){
      const r=pdfRectToCanvas(a,d.overlay.height);
  
      if(a.type==='highlight'){
        ctx.save();
        ctx.fillStyle='rgba(255,235,59,.38)';
        ctx.fillRect(r.x,r.y,r.w,r.h);
        ctx.restore();
      }else{
        drawNoteBox(
          ctx,r.x,r.y,a.text,
          d.overlay.width,d.overlay.height
        );
      }
    }
  }
  
  function addPending(n,a){
    if(!pending[n]) pending[n]=[];
    pending[n].push(a);
    history.push({page:n});
    setDirty(true);
    redraw(n);
  }
  
  function attach(n,overlay){
    let start=null,now=null;
  
    overlay.onpointerdown=e=>{
      if(!editMode || tool!=='highlight') return;
      start=canvasPoint(overlay,e);
      now=start;
      overlay.setPointerCapture(e.pointerId);
    };
  
    overlay.onpointermove=e=>{
      if(!editMode || tool!=='highlight' || !start) return;
      now=canvasPoint(overlay,e);
  
      redraw(n).then(()=>{
        const ctx=overlay.getContext('2d');
        const x=Math.min(start.x,now.x);
        const y=Math.min(start.y,now.y);
        const w=Math.abs(now.x-start.x);
        const h=Math.abs(now.y-start.y);
  
        ctx.save();
        ctx.fillStyle='rgba(255,235,59,.25)';
        ctx.strokeStyle='#ca8a04';
        ctx.fillRect(x,y,w,h);
        ctx.strokeRect(x,y,w,h);
        ctx.restore();
      });
    };
  
    overlay.onpointerup=e=>{
      if(!editMode || tool!=='highlight' || !start) return;
  
      now=canvasPoint(overlay,e);
      const x1=Math.min(start.x,now.x),x2=Math.max(start.x,now.x);
      const y1=Math.min(start.y,now.y),y2=Math.max(start.y,now.y);
  
      if(x2-x1>5 && y2-y1>5){
        const bl=canvasToPdf(overlay,{x:x1,y:y2});
        const tr=canvasToPdf(overlay,{x:x2,y:y1});
  
        addPending(n,{
          type:'highlight',
          x:bl.x,y:bl.y,
          w:tr.x-bl.x,h:tr.y-bl.y,
          text:''
        });
      }
  
      start=null;
      now=null;
    };
  
    overlay.onclick=e=>{
      if(!editMode || tool!=='note') return;
  
      const text=$('noteText').value.trim();
      if(!text){
        alert('메모 내용을 먼저 입력하세요.');
        return;
      }
  
      const p=canvasToPdf(overlay,canvasPoint(overlay,e));
  
      addPending(n,{
        type:'text',
        x:p.x,y:p.y,
        w:22/zoom,h:22/zoom,
        text
      });
    };
  }
  
  async function renderSelectableTextLayer(page,viewport,textLayer){
    textLayer.innerHTML='';
    textLayer.style.width=Math.floor(viewport.width)+'px';
    textLayer.style.height=Math.floor(viewport.height)+'px';

    // PDF.js 3.x text layer는 viewport.scale과 같은 --scale-factor가 필요하다.
    textLayer.style.setProperty(
      '--scale-factor',
      String(viewport.scale)
    );

    const textContent=await page.getTextContent();

    const task=pdfjsLib.renderTextLayer({
      textContentSource:textContent,
      container:textLayer,
      viewport,
      textDivs:[]
    });

    if(task?.promise){
      await task.promise;
    }
  }

  async function renderPage(n,wrap){
    if(rendered.has(n)) return;

    const page=await pdfDoc.getPage(n);
    const viewport=page.getViewport({scale:zoom});

    wrap.innerHTML='';

    const label=document.createElement('div');
    label.className='page-label';
    label.textContent=`p.${n} · v${APP_VERSION}`;

    const base=document.createElement('canvas');
    base.className='base';
    base.width=Math.floor(viewport.width);
    base.height=Math.floor(viewport.height);

    const textLayer=document.createElement('div');
    textLayer.className='textLayer';
    textLayer.style.pointerEvents=editMode?'none':'auto';
    textLayer.classList.toggle('selection-disabled',editMode);

    const overlay=document.createElement('canvas');
    overlay.className='overlay';
    overlay.width=base.width;
    overlay.height=base.height;
    overlay.style.pointerEvents=editMode?'auto':'none';
    overlay.style.cursor=editMode?(tool==='highlight'?'crosshair':'copy'):'default';

    wrap.style.width=base.width+'px';
    wrap.style.height=base.height+'px';
    wrap.append(label,base,textLayer,overlay);

    rendered.set(n,{wrap,base,textLayer,overlay,page});
    attach(n,overlay);

    await page.render({
      canvasContext:base.getContext('2d'),
      viewport
    }).promise;

    try{
      await renderSelectableTextLayer(
        page,
        viewport,
        textLayer
      );
    }catch(error){
      console.warn(
        `텍스트 선택 레이어 생성 실패 (p.${n})`,
        error
      );
    }

    await redraw(n);
  }

  function makeSlots(){
    pagesEl.innerHTML='';
    rendered.clear();
  
    for(let i=1;i<=pdfDoc.numPages;i++){
      const w=document.createElement('div');
      w.className='page-wrap';
      w.dataset.page=i;
  
      const ph=document.createElement('div');
      ph.className='loading-page';
      ph.textContent=`${i}페이지`;
  
      w.append(ph);
      pagesEl.append(w);
    }
  
    const io=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(e.isIntersecting) renderPage(Number(e.target.dataset.page),e.target);
      }
    },{root:scrollArea,rootMargin:'900px 0px'});
  
    document.querySelectorAll('.page-wrap').forEach(x=>io.observe(x));
  }
  
  scrollArea.onscroll=()=>{
    const top=scrollArea.getBoundingClientRect().top;
    let best=1,dist=Infinity;
  
    document.querySelectorAll('.page-wrap').forEach(el=>{
      const d=Math.abs(el.getBoundingClientRect().top-top-10);
      if(d<dist){
        dist=d;
        best=Number(el.dataset.page);
      }
    });
  
    $('pageIndicator').textContent=`페이지 ${best} / ${pdfDoc.numPages} · v${APP_VERSION}`;
  };
  
  $('undoBtn').onclick=()=>{
    const h=history.pop();
    if(!h) return;
  
    (pending[h.page]||[]).pop();
    setDirty(history.length>0);
    redraw(h.page);
  };
  
  $('cancelEditBtn').onclick=async()=>{
    if(dirty && !confirm('저장하지 않은 편집 내용을 취소할까요?')) return;
  
    clearPending();
    for(const n of rendered.keys()) await redraw(n);
    setEditMode(false,'편집을 취소했습니다. 읽기 모드입니다.');
  };
  
  async function rerender(){
    const s=scrollArea.scrollTop;
    makeSlots();
    requestAnimationFrame(()=>{scrollArea.scrollTop=s});
  }
  
  $('zoomOutBtn').onclick=async()=>{
    zoom=Math.max(.7,zoom-.15);
    $('zoomText').textContent=Math.round(zoom*100)+'%';
    await rerender();
  };
  
  $('zoomInBtn').onclick=async()=>{
    zoom=Math.min(2.4,zoom+.15);
    $('zoomText').textContent=Math.round(zoom*100)+'%';
    await rerender();
  };
  
  function ensureAnnotsArray(doc,page){
    const {PDFName,PDFArray}=PDFLib;
    const key=PDFName.of('Annots');
    let arr=page.node.lookupMaybe(key,PDFArray);
  
    if(!arr){
      arr=doc.context.obj([]);
      page.node.set(key,arr);
    }
  
    return arr;
  }
  
  function addHighlight(doc,page,a){
    const {PDFName,PDFNumber,PDFHexString}=PDFLib;
    const x1=a.x,y1=a.y,x2=a.x+a.w,y2=a.y+a.h;
  
    const dict=doc.context.obj({
      Type:PDFName.of('Annot'),
      Subtype:PDFName.of('Highlight'),
      Rect:doc.context.obj([x1,y1,x2,y2]),
      QuadPoints:doc.context.obj([x1,y2,x2,y2,x1,y1,x2,y1]),
      C:doc.context.obj([1,.92,.18]),
      CA:PDFNumber.of(.35),
      Contents:PDFHexString.fromText(a.text||''),
      F:PDFNumber.of(4)
    });
  
    ensureAnnotsArray(doc,page).push(doc.context.register(dict));
  }
  
  function addText(doc,page,a){
    const {PDFName,PDFNumber,PDFHexString}=PDFLib;
    const s=22;
  
    const dict=doc.context.obj({
      Type:PDFName.of('Annot'),
      Subtype:PDFName.of('Text'),
      Rect:doc.context.obj([a.x,a.y,a.x+s,a.y+s]),
      Contents:PDFHexString.fromText(a.text||''),
      Name:PDFName.of('Comment'),
      C:doc.context.obj([1,.82,0]),
      F:PDFNumber.of(4)
    });
  
    ensureAnnotsArray(doc,page).push(doc.context.register(dict));
  }
  
  async function buildPdf(){
    const doc=await PDFLib.PDFDocument.load(originalBytes.slice());
    const ps=doc.getPages();
  
    for(const [k,list] of Object.entries(pending)){
      const page=ps[Number(k)-1];
      if(!page) continue;
  
      for(const a of list){
        if(a.type==='highlight') addHighlight(doc,page,a);
        else addText(doc,page,a);
      }
    }
  
    return new Uint8Array(await doc.save());
  }
  
  async function reload(bytes){
    originalBytes=bytes;
    pdfDoc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
    clearPending();
    makeSlots();
  }
  
  async function finishSave(bytes,message){
    await reload(bytes);
    setEditMode(false,message);
  }
  
  $('saveBtn').onclick=async()=>{
    try{
      $('saveBtn').disabled=true;
      status.textContent='저장 중...';
  
      if(!await ensurePermission(rootHandle,'readwrite',true)){
        throw new Error('쓰기 권한이 없습니다.');
      }
  
      const bytes=dirty ? await buildPdf() : originalBytes;
      const w=await fileHandle.createWritable();
      await w.write(bytes);
      await w.close();
  
      await finishSave(
        bytes,
        `저장 완료 · 읽기 모드로 돌아왔습니다. · v${APP_VERSION}`
      );
    }catch(e){
      alert('저장 실패: '+e.message);
    }finally{
      $('saveBtn').disabled=false;
    }
  };
  
  $('closeBtn').onclick=()=>{
    if(dirty && !confirm('저장되지 않은 변경 사항이 있습니다. 닫을까요?')) return;
    window.close();
  };
  
  window.onbeforeunload=e=>{
    if(dirty){
      e.preventDefault();
      e.returnValue='';
    }
  };
  
  relativePath=params.get('file')||'';
  if(!relativePath) return alert('PDF 경로가 없습니다.');
  
  rootHandle=await loadRootHandle();
  if(!rootHandle) return alert('논문 폴더가 연결되지 않았습니다.');
  
  const r=await resolveFile(rootHandle,relativePath);
  fileHandle=r.fileHandle;
  parentHandle=r.parentHandle;
  fileName=r.fileName;
  
  $('fileName').textContent=fileName;
  $('filePath').textContent=relativePath;
  document.title=`${fileName} · 파란 논문 · v${APP_VERSION}`;
  
  const f=await fileHandle.getFile();
  originalBytes=new Uint8Array(await f.arrayBuffer());
  pdfDoc=await pdfjsLib.getDocument({data:originalBytes.slice()}).promise;
  
  const initialPage=Math.min(requestedPage,pdfDoc.numPages);
  $('pageIndicator').textContent=`페이지 ${initialPage} / ${pdfDoc.numPages} · v${APP_VERSION}`;
  makeSlots();
  setEditMode(
    false,
    `읽기 모드 · 글자를 드래그해서 선택·복사할 수 있습니다. · v${APP_VERSION}`
  );

  if(initialPage>1){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        const target=document.querySelector(`.page-wrap[data-page="${initialPage}"]`);
        if(target)target.scrollIntoView({block:'start'});
      });
    });
  }
})().catch(e=>{console.error(e);alert(e.message);const s=document.getElementById('viewerStatus');if(s)s.textContent='오류: '+e.message;});
