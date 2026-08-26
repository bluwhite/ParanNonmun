/* 파란 논문 - Univer Sheets 연결 모듈 */
(function(global){
  "use strict";

  const MANAGED_SHEET_ID="paran-paper-list";
  const WORKBOOK_ID="paran-paper-workbook";

  let univer=null;
  let univerAPI=null;
  let changeDisposable=null;
  let commandDisposable=null;
  let cellClickDisposable=null;
  let hostDoubleClickElement=null;
  let hostDoubleClickHandler=null;
  let currentData=null;
  let onDataChange=async()=>{};
  let onCount=()=>{};
  let onStatus=()=>{};
  let onPdfDoubleClick=async()=>{};
  let syncTimer=null;
  let syncing=false;
  let restoring=false;
  let lastSnapshotJson="";
  let lastValidSnapshot=null;
  let findCursor={query:"",index:-1};
  let lastPdfCellClick={row:-1,column:-1,time:0};

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


  function systemColumnIndex(snapshot,field){
    const managed=getManagedSheet(snapshot);
    if(!managed)return null;

    const wanted=global.ParanPaperData.SYSTEM_COLUMNS
      .find(column=>column.field===field);

    if(!wanted)return null;

    const wantedName=
      global.ParanPaperData.normalizeColumnName(wanted.name);

    const header=getHeaders(managed)
      .find(item=>
        global.ParanPaperData.normalizeColumnName(item.name)===wantedName
      );

    return header ? header.index : null;
  }

  function fieldAtColumn(snapshot,columnIndex){
    const managed=getManagedSheet(snapshot);
    if(!managed)return null;

    const row=managed.cellData?.[0] || managed.cellData?.["0"] || {};
    const name=cellText(row[columnIndex] ?? row[String(columnIndex)])
      .normalize("NFKC")
      .trim();

    if(!name)return null;

    const key=global.ParanPaperData.normalizeColumnName(name);
    const system=global.ParanPaperData.SYSTEM_COLUMNS.find(column=>
      global.ParanPaperData.normalizeColumnName(column.name)===key
    );

    return system?.field || null;
  }

  function contextAt(rowIndex,columnIndex=null){
    const workbook=getActiveWorkbook();
    if(!workbook)return null;

    const snapshot=workbook.save();
    const managed=getManagedSheet(snapshot);
    if(!managed || !Number.isInteger(rowIndex) || rowIndex<=0)return null;

    const row=managed.cellData?.[rowIndex] ||
      managed.cellData?.[String(rowIndex)] ||
      {};

    function value(field){
      const column=systemColumnIndex(snapshot,field);
      if(column===null)return "";
      return cellText(row[column] ?? row[String(column)]);
    }

    return {
      rowIndex,
      columnIndex,
      field:Number.isInteger(columnIndex)
        ? fieldAtColumn(snapshot,columnIndex)
        : null,
      title:value("title"),
      pdf:value("pdf")
    };
  }

  function getSelectedRowContext(){
    const worksheet=getManagedWorksheet();
    if(!worksheet)return null;

    try{
      const selection=worksheet.getSelection?.();
      const current=selection?.getCurrentCell?.();

      if(current){
        const row=Number.isInteger(current.actualRow)
          ? current.actualRow
          : current.row;
        const column=Number.isInteger(current.actualColumn)
          ? current.actualColumn
          : current.column;

        if(Number.isInteger(row)){
          return contextAt(
            row,
            Number.isInteger(column) ? column : null
          );
        }
      }

      const active=selection?.getActiveRange?.();
      const row=active?.getRow?.();
      const column=active?.getColumn?.();

      if(Number.isInteger(row)){
        return contextAt(
          row,
          Number.isInteger(column) ? column : null
        );
      }
    }catch(error){
      console.warn("선택 셀 확인 실패:",error);
    }

    return null;
  }

  async function setSystemFieldAtRow(rowIndex,field,value){
    const worksheet=getManagedWorksheet();
    const workbook=getActiveWorkbook();

    if(!worksheet || !workbook){
      throw new Error("논문 목록 시트를 찾지 못했습니다.");
    }

    try{
      await workbook.endEditingAsync?.(true);
    }catch(_e){}

    const snapshot=workbook.save();
    const column=systemColumnIndex(snapshot,field);

    if(column===null){
      const definition=global.ParanPaperData.SYSTEM_COLUMNS
        .find(item=>item.field===field);
      throw new Error(
        `${definition?.name || field} 열을 찾지 못했습니다.`
      );
    }

    if(!Number.isInteger(rowIndex) || rowIndex<=0){
      throw new Error("논문 행을 선택하세요.");
    }

    restoring=true;
    try{
      worksheet
        .getRange(rowIndex,column)
        .setValue(String(value??""));
    }finally{
      restoring=false;
    }

    return syncNow(true);
  }

  function firePdfDoubleClick(context){
    // 데이터 행이면 어느 열의 셀을 더블클릭해도 그 행의 PDF를 연다.
    if(!context || context.rowIndex<=0)return;

    Promise.resolve(
      onPdfDoubleClick(context)
    ).catch(error=>{
      console.error("PDF 더블클릭 열기 실패:",error);
    });
  }

  function disposeListeners(){
    try{changeDisposable?.dispose?.();}catch(_e){}
    try{commandDisposable?.dispose?.();}catch(_e){}
    try{cellClickDisposable?.dispose?.();}catch(_e){}

    if(hostDoubleClickElement && hostDoubleClickHandler){
      try{
        hostDoubleClickElement.removeEventListener(
          "dblclick",
          hostDoubleClickHandler
        );
      }catch(_e){}
    }

    changeDisposable=null;
    commandDisposable=null;
    cellClickDisposable=null;
    hostDoubleClickElement=null;
    hostDoubleClickHandler=null;
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

    commandDisposable=
      univerAPI.onCommandExecuted?.(()=>scheduleSync(300)) || null;

    // Univer의 셀 클릭 이벤트가 있으면 같은 데이터 셀을 짧은 시간 안에
    // 두 번 클릭한 것을 더블클릭으로 간주한다.
    if(univerAPI.Event?.CellClicked){
      cellClickDisposable=univerAPI.addEvent(
        univerAPI.Event.CellClicked,
        params=>{
          const row=params?.row;
          const column=params?.column;

          if(!Number.isInteger(row) || !Number.isInteger(column))return;

          const context=contextAt(row,column);

          if(!context || context.rowIndex<=0){
            lastPdfCellClick={row:-1,column:-1,time:0};
            return;
          }

          const now=Date.now();
          const isDouble=
            lastPdfCellClick.row===row &&
            lastPdfCellClick.column===column &&
            now-lastPdfCellClick.time<=480;

          lastPdfCellClick={row,column,time:now};

          if(isDouble){
            lastPdfCellClick={row:-1,column:-1,time:0};
            firePdfDoubleClick(context);
          }
        }
      );
      return;
    }

    // 구버전에서 CellClicked가 노출되지 않는 경우 DOM dblclick을 보조로 사용.
    const host=document.getElementById("paperSheet");
    if(host){
      hostDoubleClickElement=host;
      hostDoubleClickHandler=()=>{
        setTimeout(()=>{
          const context=getSelectedRowContext();
          firePdfDoubleClick(context);
        },0);
      };
      host.addEventListener("dblclick",hostDoubleClickHandler);
    }
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


  function getColumnHeaders(){
    const workbook=getActiveWorkbook();
    if(!workbook)return [];

    const snapshot=workbook.save();
    const sheet=getManagedSheet(snapshot);

    return sheet
      ? getHeaders(sheet)
          .filter(header=>header.name!=="")
          .map(header=>({
            index:header.index,
            name:header.name
          }))
      : [];
  }

  function lastUsedRow(sheet){
    let maxUsedRow=0;

    for(const rowKey of Object.keys(sheet?.cellData || {})){
      const rowIndex=Number(rowKey);
      if(!Number.isFinite(rowIndex) || rowIndex<=0)continue;

      const cells=sheet.cellData[rowKey] || {};
      const hasValue=Object.values(cells)
        .some(cell=>cellText(cell).trim()!=="");

      if(hasValue && rowIndex>maxUsedRow){
        maxUsedRow=rowIndex;
      }
    }

    return maxUsedRow;
  }

  async function appendImportedRows(records){
    if(!Array.isArray(records) || !records.length){
      return {
        count:0,
        data:currentData
      };
    }

    clearTimeout(syncTimer);

    const workbook=getActiveWorkbook();
    if(!workbook){
      throw new Error("논문 목록 시트를 찾지 못했습니다.");
    }

    try{
      await workbook.endEditingAsync?.(true);
    }catch(_e){}

    const snapshot=workbook.save();
    const validation=validateManagedSheet(snapshot);

    if(!validation.ok){
      throw new Error(validation.message);
    }

    const managed=getManagedSheet(snapshot);
    if(!managed){
      throw new Error("논문 목록 시트를 찾지 못했습니다.");
    }

    managed.cellData=managed.cellData || {};

    const headers=getHeaders(managed)
      .filter(header=>header.name!=="");

    const normalizedHeaders=headers.map(header=>({
      ...header,
      key:global.ParanPaperData.normalizeColumnName(header.name)
    }));

    let targetRow=Math.max(1,lastUsedRow(managed)+1);
    const startRow=targetRow;
    let count=0;

    for(const record of records){
      if(!record || typeof record!=="object")continue;

      const rowData={};
      let hasValue=false;

      for(const header of normalizedHeaders){
        const value=String(
          record[header.key] ?? ""
        );

        if(value.trim()==="")continue;

        rowData[header.index]={v:value};
        hasValue=true;
      }

      if(!hasValue)continue;

      managed.cellData[targetRow]=rowData;
      targetRow++;
      count++;
    }

    if(!count){
      return {
        count:0,
        data:currentData
      };
    }

    managed.rowCount=Math.max(
      Number(managed.rowCount)||0,
      targetRow+80
    );

    const next=deriveDataFromSnapshot(
      snapshot,
      currentData
    );

    currentData=next;
    lastValidSnapshot=clone(snapshot);
    lastSnapshotJson=JSON.stringify(snapshot);

    onCount(next.papers.length);
    onStatus("엑셀 데이터 저장 중...","saving");

    await onDataChange(next);

    // 저장한 스냅샷을 다시 표시하면 현재 열 순서/너비/서식 및
    // 사용자가 만든 다른 시트를 그대로 유지하면서 새 행이 즉시 나타난다.
    await loadWorkbook(next);

    const worksheet=getManagedWorksheet();

    try{
      worksheet?.getRange(startRow,0)?.activate?.();
      worksheet?.scrollToCell?.(startRow,0,180);
    }catch(_e){}

    onStatus("저장됨","saved");

    return {
      count,
      startRow,
      data:next
    };
  }


  function setReferenceFormats(formats){
    if(!currentData)return [];

    currentData={
      ...currentData,
      referenceFormats:
        global.ParanPaperData.normalizeReferenceFormats(formats)
    };

    return currentData.referenceFormats;
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
    onPdfDoubleClick=options.onPdfDoubleClick || onPdfDoubleClick;
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
    getColumnHeaders,
    appendImportedRows,
    setReferenceFormats,
    getSelectedRowContext,
    setSystemFieldAtRow,
    getData
  };
})(window);
