/* 파란 논문 - Univer Sheets 연결 모듈 */
(function(global){
  "use strict";

  const MANAGED_SHEET_ID="paran-paper-list";
  const WORKBOOK_ID="paran-paper-workbook";

  let univer=null;
  let univerAPI=null;
  let changeDisposable=null;
  let commandDisposable=null;
  let currentData=null;
  let onDataChange=async()=>{};
  let onCount=()=>{};
  let onStatus=()=>{};
  let syncTimer=null;
  let syncing=false;
  let restoring=false;
  let lastSnapshotJson="";
  let lastValidSnapshot=null;
  let findCursor={query:"",index:-1};

  function clone(value){
    return value==null ? value : JSON.parse(JSON.stringify(value));
  }

  function cellText(cell){
    return global.ParanPaperData.cellText(cell);
  }

  function getManagedSheet(snapshot){
    if(!snapshot?.sheets)return null;
    if(snapshot.sheets[MANAGED_SHEET_ID])return snapshot.sheets[MANAGED_SHEET_ID];
    return null;
  }

  function paperValue(paper,column){
    if(column.system)return paper[column.field] ?? "";
    return paper.custom?.[column.id] ?? "";
  }

  function makeInitialSnapshot(data){
    const columns=data.columns || global.ParanPaperData.SYSTEM_COLUMNS;
    const papers=data.papers || [];
    const cellData={0:{}};

    columns.forEach((column,col)=>{
      cellData[0][col]={
        v:column.name,
        s:{bl:1,bg:{rgb:"#EAF2FF"}}
      };
    });

    papers.forEach((paper,index)=>{
      const row=index+1;
      cellData[row]={};
      columns.forEach((column,col)=>{
        const value=String(paperValue(paper,column) ?? "");
        if(value!=="")cellData[row][col]={v:value};
      });
    });

    return {
      id:WORKBOOK_ID,
      name:"파란 논문",
      locale:"enUS",
      sheetOrder:[MANAGED_SHEET_ID],
      sheets:{
        [MANAGED_SHEET_ID]:{
          id:MANAGED_SHEET_ID,
          name:"논문 목록",
          rowCount:Math.max(200,papers.length+80),
          columnCount:Math.max(26,columns.length+10),
          defaultColumnWidth:120,
          defaultRowHeight:26,
          rowHeader:{width:46},
          columnHeader:{height:24},
          showGridlines:1,
          freeze:{xSplit:0,ySplit:1,startRow:1,startColumn:0},
          cellData,
          columnData:buildColumnWidths(columns)
        }
      }
    };
  }

  function buildColumnWidths(columns){
    const widths={};
    columns.forEach((column,index)=>{
      let w=120;
      if(column.id==="check")w=78;
      else if(["year","volume","issue","startPage","endPage"].includes(column.id))w=92;
      else if(column.id==="title")w=340;
      else if(["journal","memo","pdf"].includes(column.id))w=230;
      else if(column.id==="authors")w=180;
      else if(column.id==="publisher")w=190;
      widths[index]={w};
    });
    return widths;
  }

  function getHeaders(sheet){
    const row=sheet?.cellData?.[0] || sheet?.cellData?.["0"] || {};
    return Object.keys(row)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a,b)=>a-b)
      .map(index=>({index,name:cellText(row[index] ?? row[String(index)]).normalize("NFKC").trim()}));
  }

  function validateManagedSheet(snapshot){
    const sheet=getManagedSheet(snapshot);
    if(!sheet){
      return {ok:false,message:"'논문 목록' 시트는 삭제할 수 없습니다."};
    }

    const headers=getHeaders(sheet).filter(h=>h.name!=="");
    const seen=new Map();

    for(const header of headers){
      const key=global.ParanPaperData.normalizeColumnName(header.name);
      if(seen.has(key)){
        return {
          ok:false,
          message:`이미 "${seen.get(key)}" 열이 있습니다. 같은 이름의 열은 사용할 수 없습니다.`
        };
      }
      seen.set(key,header.name);
    }

    for(const systemColumn of global.ParanPaperData.SYSTEM_COLUMNS){
      const key=global.ParanPaperData.normalizeColumnName(systemColumn.name);
      if(!seen.has(key)){
        return {
          ok:false,
          message:`기본 열 "${systemColumn.name}"은 이름을 바꾸거나 삭제할 수 없습니다.`
        };
      }
    }

    return {ok:true};
  }

  function previousColumnMap(data){
    const map=new Map();
    for(const column of data?.columns || []){
      map.set(global.ParanPaperData.normalizeColumnName(column.name),column);
    }
    return map;
  }

  function paperSignature(paper){
    return [paper.authors,paper.year,paper.title,paper.journal]
      .map(v=>String(v??"").normalize("NFKC").trim().toLocaleLowerCase())
      .join("\u241f");
  }

  function deriveDataFromSnapshot(snapshot,previousData){
    const sheet=getManagedSheet(snapshot);
    if(!sheet)throw new Error("논문 목록 시트를 찾지 못했습니다.");

    const previousByName=previousColumnMap(previousData);
    const systemByName=new Map(
      global.ParanPaperData.SYSTEM_COLUMNS.map(c=>[
        global.ParanPaperData.normalizeColumnName(c.name),c
      ])
    );

    const headers=getHeaders(sheet).filter(h=>h.name!=="");
    const columns=[];
    const positions=[];

    for(const header of headers){
      const key=global.ParanPaperData.normalizeColumnName(header.name);
      const system=systemByName.get(key);
      let column;

      if(system){
        column={...system};
      }else{
        const old=previousByName.get(key);
        column=old && !old.system
          ? {...old,name:header.name}
          : global.ParanPaperData.createCustomColumn(header.name);
      }

      columns.push(column);
      positions.push({index:header.index,column});
    }

    const oldIdQueues=new Map();
    for(const oldPaper of previousData?.papers || []){
      const sig=paperSignature(oldPaper);
      if(!oldIdQueues.has(sig))oldIdQueues.set(sig,[]);
      oldIdQueues.get(sig).push(oldPaper.id);
    }

    const papers=[];
    const rowKeys=Object.keys(sheet.cellData || {})
      .map(Number)
      .filter(row=>Number.isFinite(row) && row>0)
      .sort((a,b)=>a-b);

    for(const rowIndex of rowKeys){
      const row=sheet.cellData[rowIndex] || sheet.cellData[String(rowIndex)] || {};
      const paper={id:"",custom:{}};
      for(const field of global.ParanPaperData.PAPER_FIELDS)paper[field]="";

      let hasValue=false;
      for(const {index,column} of positions){
        const value=cellText(row[index] ?? row[String(index)]);
        if(value.trim()!=="")hasValue=true;
        if(column.system)paper[column.field]=value;
        else paper.custom[column.id]=value;
      }

      if(!hasValue)continue;

      const sig=paperSignature(paper);
      const queue=oldIdQueues.get(sig);
      if(queue?.length)paper.id=queue.shift();
      else if(global.crypto?.randomUUID)paper.id=`paper-${global.crypto.randomUUID()}`;
      else paper.id=`paper-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      papers.push(paper);
    }

    return {
      ...previousData,
      columns,
      papers,
      sheetSnapshot:snapshot
    };
  }

  function getActiveWorkbook(){
    return univerAPI?.getActiveWorkbook?.() || null;
  }

  function getManagedWorksheet(){
    const workbook=getActiveWorkbook();
    if(!workbook)return null;
    return workbook.getSheetBySheetId?.(MANAGED_SHEET_ID) || workbook.getActiveSheet?.() || null;
  }

  function disposeListeners(){
    try{changeDisposable?.dispose?.();}catch(_e){}
    try{commandDisposable?.dispose?.();}catch(_e){}
    changeDisposable=null;
    commandDisposable=null;
  }

  function disposeWorkbook(){
    disposeListeners();
    const workbook=getActiveWorkbook();
    if(workbook){
      try{univerAPI.disposeUnit(workbook.getId());}catch(_e){}
    }
  }

  function ensureUniver(containerId){
    if(univerAPI)return;

    if(!global.UniverPresets || !global.UniverCore || !global.UniverPresetSheetsCore){
      throw new Error("Univer Sheets 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }

    const {createUniver}=global.UniverPresets;
    const {LocaleType,mergeLocales}=global.UniverCore;
    const {UniverSheetsCorePreset}=global.UniverPresetSheetsCore;

    const created=createUniver({
      locale:LocaleType.EN_US,
      locales:{
        [LocaleType.EN_US]:mergeLocales(global.UniverPresetSheetsCoreEnUS)
      },
      presets:[
        UniverSheetsCorePreset({
          container:containerId,
          formulaBar:true,
          contextMenu:true
        })
      ]
    });

    univer=created.univer;
    univerAPI=created.univerAPI;
  }

  async function loadWorkbook(data){
    disposeWorkbook();
    currentData=data;

    const snapshot=data.sheetSnapshot
      ? clone(data.sheetSnapshot)
      : makeInitialSnapshot(data);

    if(!snapshot.sheets?.[MANAGED_SHEET_ID]){
      const fallback=makeInitialSnapshot(data);
      snapshot.sheets=snapshot.sheets || {};
      snapshot.sheets[MANAGED_SHEET_ID]=fallback.sheets[MANAGED_SHEET_ID];
      snapshot.sheetOrder=Array.isArray(snapshot.sheetOrder) ? snapshot.sheetOrder : [];
      if(!snapshot.sheetOrder.includes(MANAGED_SHEET_ID))snapshot.sheetOrder.unshift(MANAGED_SHEET_ID);
    }

    restoring=true;
    univerAPI.createWorkbook(snapshot);
    restoring=false;

    lastValidSnapshot=clone(snapshot);
    lastSnapshotJson=JSON.stringify(snapshot);
    onCount(data.papers?.length || 0);

    bindEvents();
  }

  function bindEvents(){
    disposeListeners();

    if(univerAPI.Event?.SheetValueChanged){
      changeDisposable=univerAPI.addEvent(
        univerAPI.Event.SheetValueChanged,
        ()=>scheduleSync(120)
      );
    }

    commandDisposable=univerAPI.onCommandExecuted?.(()=>scheduleSync(300)) || null;
  }

  function scheduleSync(delay=280){
    if(restoring)return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>syncNow(false),delay);
  }

  async function restoreLastValid(message){
    if(restoring)return;
    restoring=true;
    try{
      const ok=await univerAPI.undo();
      if(!ok && lastValidSnapshot){
        const active=getActiveWorkbook();
        if(active)univerAPI.disposeUnit(active.getId());
        univerAPI.createWorkbook(clone(lastValidSnapshot));
        bindEvents();
      }
      alert(message);
    }finally{
      setTimeout(()=>{restoring=false;},0);
    }
  }

  async function syncNow(force=false){
    if(syncing || restoring || !univerAPI || !currentData)return currentData;
    syncing=true;

    try{
      const workbook=getActiveWorkbook();
      if(!workbook)return currentData;

      const snapshot=workbook.save();
      const json=JSON.stringify(snapshot);
      if(!force && json===lastSnapshotJson)return currentData;

      const validation=validateManagedSheet(snapshot);
      if(!validation.ok){
        await restoreLastValid(validation.message);
        return currentData;
      }

      const next=deriveDataFromSnapshot(snapshot,currentData);
      currentData=next;
      lastValidSnapshot=clone(snapshot);
      lastSnapshotJson=json;
      onCount(next.papers.length);
      onStatus("저장 중...","saving");
      await onDataChange(next);
      onStatus("저장됨","saved");
      return next;
    }catch(error){
      console.error(error);
      onStatus(`저장 실패: ${error.message}`,"error");
      return currentData;
    }finally{
      syncing=false;
    }
  }

  function existingHeaderNames(){
    const workbook=getActiveWorkbook();
    const snapshot=workbook?.save?.();
    const sheet=snapshot ? getManagedSheet(snapshot) : null;
    return sheet ? getHeaders(sheet).filter(h=>h.name!=="") : [];
  }

  function isDuplicateName(name){
    const target=global.ParanPaperData.normalizeColumnName(name);
    return existingHeaderNames().some(h=>
      global.ParanPaperData.normalizeColumnName(h.name)===target
    );
  }

  function selectedColumnIndex(){
    const sheet=getManagedWorksheet();
    if(!sheet)return null;
    try{
      const active=sheet.getSelection()?.getActiveRange?.();
      const col=active?.getColumn?.();
      return Number.isInteger(col) ? col : null;
    }catch(_e){
      return null;
    }
  }

  function columnLetter(index){
    let n=index+1;
    let text="";
    while(n>0){
      const r=(n-1)%26;
      text=String.fromCharCode(65+r)+text;
      n=Math.floor((n-1)/26);
    }
    return text;
  }

  async function addColumn(name){
    const clean=String(name??"").normalize("NFKC").trim();
    if(!clean)throw new Error("열 이름을 입력하세요.");
    if(isDuplicateName(clean))throw new Error(`이미 "${clean}" 열이 있습니다. 같은 이름의 열은 추가할 수 없습니다.`);

    const sheet=getManagedWorksheet();
    if(!sheet)throw new Error("논문 목록 시트를 찾지 못했습니다.");

    let baseCol=selectedColumnIndex();
    if(baseCol===null){
      const headers=existingHeaderNames();
      baseCol=headers.length ? Math.max(...headers.map(h=>h.index)) : -1;
    }

    restoring=true;
    try{
      if(baseCol>=0){
        sheet.insertColumnAfter(baseCol);
        sheet.getRange(0,baseCol+1).setValue(clean);
        sheet.getRange(0,baseCol+1).setFontWeight?.("bold");
        sheet.getRange(0,baseCol+1).activate?.();
      }else{
        sheet.getRange(0,0).setValue(clean);
      }
    }finally{
      restoring=false;
    }

    await syncNow(true);
  }

  async function moveSelectedColumn(direction){
    const sheet=getManagedWorksheet();
    if(!sheet)throw new Error("논문 목록 시트를 찾지 못했습니다.");
    const col=selectedColumnIndex();
    if(col===null)throw new Error("먼저 이동할 열의 셀을 선택하세요.");

    const headers=existingHeaderNames();
    const maxNamed=headers.length ? Math.max(...headers.map(h=>h.index)) : 0;

    if(direction<0 && col<=0)return;
    if(direction>0 && col>=maxNamed)return;

    const letter=columnLetter(col);
    const spec=sheet.getRange(`${letter}:${letter}`);
    const destination=direction<0 ? col-1 : col+2;

    restoring=true;
    try{
      sheet.moveColumns(spec,destination);
    }finally{
      restoring=false;
    }

    await syncNow(true);
  }

  async function findNext(query){
    const q=String(query??"").normalize("NFKC").trim().toLocaleLowerCase();
    if(!q)return false;

    const workbook=getActiveWorkbook();
    if(!workbook)return false;
    const snapshot=workbook.save();
    const sheet=getManagedSheet(snapshot);
    if(!sheet)return false;

    const matches=[];
    for(const [rowKey,row] of Object.entries(sheet.cellData || {})){
      const r=Number(rowKey);
      for(const [colKey,cell] of Object.entries(row || {})){
        const c=Number(colKey);
        if(cellText(cell).normalize("NFKC").toLocaleLowerCase().includes(q)){
          matches.push({r,c});
        }
      }
    }

    matches.sort((a,b)=>a.r-b.r || a.c-b.c);
    if(!matches.length)return false;

    if(findCursor.query!==q){
      findCursor={query:q,index:0};
    }else{
      findCursor.index=(findCursor.index+1)%matches.length;
    }

    const hit=matches[findCursor.index];
    const ws=getManagedWorksheet();
    ws.getRange(hit.r,hit.c).activate();
    ws.scrollToCell?.(hit.r,hit.c,180);
    return true;
  }

  async function flush(){
    clearTimeout(syncTimer);
    const workbook=getActiveWorkbook();
    try{await workbook?.endEditingAsync?.(true);}catch(_e){}
    return syncNow(true);
  }

  async function mount(options){
    onDataChange=options.onDataChange || onDataChange;
    onCount=options.onCount || onCount;
    onStatus=options.onStatus || onStatus;
    ensureUniver(options.containerId);
    await loadWorkbook(options.data);
  }

  async function reload(data){
    if(!univerAPI)throw new Error("스프레드시트가 아직 준비되지 않았습니다.");
    await loadWorkbook(data);
  }

  function getData(){return currentData;}

  global.ParanPaperSheet={
    mount,
    reload,
    flush,
    addColumn,
    moveSelectedColumn,
    findNext,
    getData
  };
})(window);
