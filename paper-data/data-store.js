/* 파란 논문 로컬 데이터 저장 모듈 */
(function(global){
  "use strict";

  const DATA_FILE_NAME = "파란논문.json";
  const SCHEMA_VERSION = 6;
  const MANAGED_SHEET_ID = "paran-paper-list";

  const SYSTEM_COLUMNS = [
    {id:"check",     name:"확인(*)",   system:true, field:"check"},
    {id:"authors",   name:"저자",      system:true, field:"authors"},
    {id:"year",      name:"출판연도",  system:true, field:"year"},
    {id:"title",     name:"논문명",    system:true, field:"title"},
    {id:"journal",   name:"학술지명",  system:true, field:"journal"},
    {id:"volume",    name:"권",        system:true, field:"volume"},
    {id:"issue",     name:"호",        system:true, field:"issue"},
    {id:"publisher", name:"학회명",    system:true, field:"publisher"},
    {id:"startPage", name:"시작페이지",system:true, field:"startPage"},
    {id:"endPage",   name:"끝페이지",  system:true, field:"endPage"},
    {id:"memo",      name:"메모",      system:true, field:"memo"},
    {id:"pdf",       name:"PDF",       system:true, field:"pdf"}
  ];

  const PAPER_FIELDS = SYSTEM_COLUMNS.map(c=>c.field);


  const REFERENCE_FORMAT_ITEMS = [
    {key:"journalKo",label:"학회지_국내"},
    {key:"thesisKo", label:"학위_국내"},
    {key:"bookKo",   label:"단행본_국내"},
    {key:"journalEn",label:"학회지_해외"},
    {key:"thesisEn", label:"학위_해외"},
    {key:"bookEn",   label:"단행본_해외"}
  ];

  const REFERENCE_TEMPLATE_CODES = [
    {code:"AU",label:"저자"},
    {code:"PY",label:"출판연도"},
    {code:"TI",label:"논문명"},
    {code:"JO",label:"학술지명"},
    {code:"VL",label:"권"},
    {code:"IS",label:"호"},
    {code:"PB",label:"학회명/발행기관"},
    {code:"SP",label:"시작페이지"},
    {code:"EP",label:"끝페이지"},
    {code:"VL+IS",label:"국내식 권·호"},
    {code:"VL(IS)",label:"권(호)"},
    {code:"VL/IS",label:"권/호"}
  ];

  const DEFAULT_REFERENCE_STYLE = Object.freeze({
    fontFamily:"HCR Dotum",
    fontSizePt:10,
    fontScalePercent:100,
    letterSpacingPercent:0,
    lineHeightPercent:180,
    leftIndentPt:6,
    rightIndentPt:0,
    hangingIndentPt:30,
    spaceBeforePt:0,
    spaceAfterPt:0,
    alignment:"justify"
  });

  const REFERENCE_ALIGNMENTS = Object.freeze([
    "left","center","right","justify"
  ]);

  function finiteNumber(value,fallback,min,max){
    const number=Number(value);
    if(!Number.isFinite(number))return fallback;
    return Math.min(max,Math.max(min,number));
  }

  function normalizeReferenceStyle(raw={},fallback=DEFAULT_REFERENCE_STYLE){
    const base={
      ...DEFAULT_REFERENCE_STYLE,
      ...(fallback && typeof fallback==="object" ? fallback : {})
    };

    const alignment=REFERENCE_ALIGNMENTS.includes(
      String(raw?.alignment||"").trim()
    )
      ? String(raw.alignment).trim()
      : base.alignment;

    return {
      fontFamily:
        String(raw?.fontFamily??base.fontFamily)
          .normalize("NFKC")
          .trim() || base.fontFamily,
      fontSizePt:finiteNumber(
        raw?.fontSizePt,
        Number(base.fontSizePt)||10,
        5,
        72
      ),
      fontScalePercent:finiteNumber(
        raw?.fontScalePercent,
        Number(base.fontScalePercent)||100,
        50,
        200
      ),
      letterSpacingPercent:finiteNumber(
        raw?.letterSpacingPercent,
        Number(base.letterSpacingPercent)||0,
        -50,
        100
      ),
      lineHeightPercent:finiteNumber(
        raw?.lineHeightPercent,
        Number(base.lineHeightPercent)||180,
        80,
        400
      ),
      leftIndentPt:finiteNumber(
        raw?.leftIndentPt,
        Number(base.leftIndentPt)||0,
        0,
        300
      ),
      rightIndentPt:finiteNumber(
        raw?.rightIndentPt,
        Number(base.rightIndentPt)||0,
        0,
        300
      ),
      hangingIndentPt:finiteNumber(
        raw?.hangingIndentPt,
        Number(base.hangingIndentPt)||0,
        0,
        300
      ),
      spaceBeforePt:finiteNumber(
        raw?.spaceBeforePt,
        Number(base.spaceBeforePt)||0,
        0,
        200
      ),
      spaceAfterPt:finiteNumber(
        raw?.spaceAfterPt,
        Number(base.spaceAfterPt)||0,
        0,
        200
      ),
      alignment
    };
  }

  function defaultFormatStyles(groupStyle=DEFAULT_REFERENCE_STYLE){
    const style=normalizeReferenceStyle(groupStyle);
    const result={};

    for(const item of REFERENCE_FORMAT_ITEMS){
      result[item.key]={
        useGroupStyle:true,
        style:{...style}
      };
    }

    return result;
  }

  function normalizeFormatStyles(raw={},groupStyle=DEFAULT_REFERENCE_STYLE){
    const result={};
    const baseStyle=normalizeReferenceStyle(groupStyle);

    for(const item of REFERENCE_FORMAT_ITEMS){
      const itemRaw=
        raw && typeof raw[item.key]==="object"
          ? raw[item.key]
          : {};

      result[item.key]={
        useGroupStyle:itemRaw.useGroupStyle!==false,
        style:normalizeReferenceStyle(
          itemRaw.style,
          baseStyle
        )
      };
    }

    return result;
  }

  function effectiveReferenceStyle(group,formatKey){
    const groupStyle=normalizeReferenceStyle(group?.style);
    const formatEntry=group?.formatStyles?.[formatKey];

    if(!formatEntry || formatEntry.useGroupStyle!==false){
      return groupStyle;
    }

    return normalizeReferenceStyle(
      formatEntry.style,
      groupStyle
    );
  }

  // 기존 Excel out_set의 아래쪽 세 묶음을 그대로 옮긴 기본값.
  // 이탤릭은 템플릿 HTML 자체의 <em>...</em>으로 보존한다.
  const DEFAULT_REFERENCE_FORMAT_GROUPS = [
    {
      id:"format-group-kyunghee",
      name:"경사대양식",
      style:{...DEFAULT_REFERENCE_STYLE},
      formatStyles:defaultFormatStyles(DEFAULT_REFERENCE_STYLE),
      formats:{
        journalKo:"AU(PY), 「TI」, 『JO』 VL+IS, PB, pp.SP-EP.",
        thesisKo:"AU(PY), 「TI」, JO.",
        bookKo:"AU(PY), 「TI」, JO.",
        journalEn:"AU(PY), TI, <em>JO</em> VL+IS, SP-EP.",
        thesisEn:"AU(PY), <em>TI</em>, JO.",
        bookEn:"AU(PY), <em>TI</em>, JO."
      }
    },
    {
      id:"format-group-1",
      name:"양식1",
      style:{...DEFAULT_REFERENCE_STYLE},
      formatStyles:defaultFormatStyles(DEFAULT_REFERENCE_STYLE),
      formats:{
        journalKo:"AU. (PY). TI. JO, VL/IS, SP-EP.",
        thesisKo:"AU. (PY). TI. JO.",
        bookKo:"AU. (PY). TI. JO.",
        journalEn:"AU. (PY), TI, <em>JO</em> VL+IS, SP-EP.",
        thesisEn:"AU. (PY), <em>TI</em>, JO.",
        bookEn:"AU. (PY), <em>TI</em>, JO."
      }
    },
    {
      id:"format-group-2",
      name:"양식2",
      style:{...DEFAULT_REFERENCE_STYLE},
      formatStyles:defaultFormatStyles(DEFAULT_REFERENCE_STYLE),
      formats:{
        journalKo:"AU(PY), &quot;TI&quot;, JO, VL/IS, SP-EP쪽.",
        thesisKo:"AU(PY), &quot;TI&quot;, JO.",
        bookKo:"AU(PY), TI, JO.",
        journalEn:"AU(PY), TI, <em>JO</em> VL+IS, SP-EP.",
        thesisEn:"AU(PY), <em>TI</em>, JO.",
        bookEn:"AU(PY), <em>TI</em>, JO."
      }
    }
  ];

  function cloneDefaultReferenceFormatGroups(){
    return DEFAULT_REFERENCE_FORMAT_GROUPS.map(group=>({
      id:group.id,
      name:group.name,
      style:{...group.style},
      formatStyles:Object.fromEntries(
        Object.entries(group.formatStyles).map(
          ([key,value])=>[
            key,
            {
              useGroupStyle:value.useGroupStyle!==false,
              style:{...value.style}
            }
          ]
        )
      ),
      formats:{...group.formats}
    }));
  }

  function normalizeReferenceFormatGroupName(name){
    return String(name??"")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
  }

  function sanitizeTemplateHtml(value){
    let html=String(value??"")
      .replace(/\r\n?/g," ")
      .replace(/<br\s*\/?>/gi," ")
      .replace(/<\/?(?:div|p|section|article|li|ul|ol|h[1-6])[^>]*>/gi," ")
      .replace(/<i(?:\s[^>]*)?>/gi,"<em>")
      .replace(/<\/i>/gi,"</em>")
      .replace(/<em(?:\s[^>]*)?>/gi,"<em>")
      .replace(/\u00a0/g,"&nbsp;");

    // 템플릿에는 텍스트와 이탤릭 표시만 저장한다.
    html=html.replace(/<(?!\/?em\b)[^>]*>/gi,"");

    // 일반 공백은 하나로 정리하되 &nbsp;는 건드리지 않는다.
    html=html.replace(/[ \t\f\v]+/g," ").trim();

    // contenteditable은 inline 태그 경계의 공백을 재직렬화하는 과정에서
    // 일반 공백을 잃을 수 있다. 이탤릭 바로 앞/뒤의 명시적 공백은
    // non-breaking space로 보존해 템플릿 -> 출력 과정에서 사라지지 않게 한다.
    //
    // 예:
    //   AU(PY), TI, <em>JO</em> VL+IS
    // -> AU(PY), TI,&nbsp;<em>JO</em>&nbsp;VL+IS
    //
    // 이 값은 화면에서는 일반 한 칸처럼 보이고 Word/HWP 복사에서도 유지된다.
    html=html
      .replace(/ <em>/gi,"&nbsp;<em>")
      .replace(/<\/em> /gi,"</em>&nbsp;")
      .replace(/<em> /gi,"<em>&nbsp;")
      .replace(/ <\/em>/gi,"&nbsp;</em>");

    return html;
  }

  function templateText(html){
    return String(html??"")
      .replace(/<[^>]+>/g,"")
      .replace(/&nbsp;/gi," ")
      .replace(/&#160;/gi," ")
      .replace(/&quot;/g,'"')
      .replace(/&apos;/g,"'")
      .replace(/&lt;/g,"<")
      .replace(/&gt;/g,">")
      .replace(/&amp;/g,"&")
      .trim();
  }

  function normalizeReferenceFormatGroup(raw={},fallback=null){
    const source=
      raw && typeof raw==="object" && !Array.isArray(raw)
        ? raw
        : {};

    const base=
      fallback && typeof fallback==="object"
        ? fallback
        : DEFAULT_REFERENCE_FORMAT_GROUPS[0];

    const sourceFormats=
      source.formats && typeof source.formats==="object"
        ? source.formats
        : {};

    const formats={};

    for(const item of REFERENCE_FORMAT_ITEMS){
      let value=sourceFormats[item.key];

      // 초기 실험 버전이나 수동 JSON에서 {html:"..."} 형태도 허용.
      if(value && typeof value==="object" && "html" in value){
        value=value.html;
      }

      if(value===undefined || value===null || String(value).trim()===""){
        value=base.formats[item.key] || "";
      }

      formats[item.key]=sanitizeTemplateHtml(value);
    }

    const style=normalizeReferenceStyle(
      source.style,
      base?.style || DEFAULT_REFERENCE_STYLE
    );

    const formatStyles=normalizeFormatStyles(
      source.formatStyles,
      style
    );

    return {
      id:String(source.id||"").trim() || newId("ref-group"),
      name:String(source.name||"").normalize("NFKC").trim(),
      style,
      formatStyles,
      formats
    };
  }

  function normalizeReferenceFormatGroups(groups){
    if(!Array.isArray(groups) || !groups.length){
      return cloneDefaultReferenceFormatGroups();
    }

    const result=[];
    const ids=new Set();
    const names=new Set();

    for(const raw of groups){
      const group=normalizeReferenceFormatGroup(raw);
      const nameKey=normalizeReferenceFormatGroupName(group.name);

      if(!nameKey || names.has(nameKey))continue;

      let id=group.id;
      while(ids.has(id)){
        id=newId("ref-group");
      }

      result.push({
        ...group,
        id
      });

      ids.add(id);
      names.add(nameKey);
    }

    return result.length
      ? result
      : cloneDefaultReferenceFormatGroups();
  }

  function newId(prefix="paper"){
    if(global.crypto && typeof global.crypto.randomUUID === "function"){
      return `${prefix}-${global.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeColumnName(name){
    return String(name ?? "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
  }

  function cloneSystemColumns(){
    return SYSTEM_COLUMNS.map(c=>({...c}));
  }

  function normalizeColumns(columns){
    if(!Array.isArray(columns) || !columns.length){
      return cloneSystemColumns();
    }

    const result=[];
    const usedIds=new Set();
    const usedNames=new Set();

    for(const raw of columns){
      if(!raw || typeof raw!=="object")continue;

      const id=String(raw.id||"").trim();
      const name=String(raw.name||"").normalize("NFKC").trim();
      if(!id || !name || usedIds.has(id))continue;

      const systemDef=SYSTEM_COLUMNS.find(c=>c.id===id);
      if(systemDef){
        const normalizedName=normalizeColumnName(systemDef.name);
        if(usedNames.has(normalizedName))continue;
        result.push({...systemDef});
        usedIds.add(id);
        usedNames.add(normalizedName);
      }else{
        const normalizedName=normalizeColumnName(name);
        if(!normalizedName || usedNames.has(normalizedName))continue;

        result.push({id,name,system:false});
        usedIds.add(id);
        usedNames.add(normalizedName);
      }
    }

    for(const systemColumn of SYSTEM_COLUMNS){
      if(!usedIds.has(systemColumn.id)){
        result.push({...systemColumn});
        usedIds.add(systemColumn.id);
        usedNames.add(normalizeColumnName(systemColumn.name));
      }
    }

    return result;
  }

  function normalizePaper(paper={}, columns=SYSTEM_COLUMNS){
    const result={
      id:paper.id || newId("paper"),
      custom:{}
    };

    for(const field of PAPER_FIELDS){
      result[field]=paper[field] == null ? "" : String(paper[field]);
    }

    if(paper.custom && typeof paper.custom==="object"){
      for(const [key,value] of Object.entries(paper.custom)){
        result.custom[key]=value == null ? "" : String(value);
      }
    }

    const customIds=new Set(columns.filter(c=>!c.system).map(c=>c.id));
    for(const key of Object.keys(result.custom)){
      if(!customIds.has(key))delete result.custom[key];
    }

    return result;
  }

  function emptyData(){
    return {
      app:"파란 논문",
      schemaVersion:SCHEMA_VERSION,
      updatedAt:new Date().toISOString(),
      columns:cloneSystemColumns(),
      papers:[],
      sheetSnapshot:null,
      referenceFormatGroups:cloneDefaultReferenceFormatGroups()
    };
  }

  function normalizeData(data){
    const normalized=emptyData();

    if(data && typeof data==="object"){
      normalized.updatedAt=data.updatedAt || normalized.updatedAt;
      normalized.columns=normalizeColumns(data.columns);
      normalized.papers=Array.isArray(data.papers)
        ? data.papers.map(p=>normalizePaper(p,normalized.columns))
        : [];
      normalized.sheetSnapshot=(data.sheetSnapshot && typeof data.sheetSnapshot==="object")
        ? data.sheetSnapshot
        : null;

      if(Object.prototype.hasOwnProperty.call(data,"referenceFormatGroups")){
        normalized.referenceFormatGroups=
          normalizeReferenceFormatGroups(data.referenceFormatGroups);
      }
    }

    return normalized;
  }

  function createCustomColumn(name){
    const cleanName=String(name ?? "").normalize("NFKC").trim();
    if(!cleanName)throw new Error("열 이름을 입력하세요.");
    return {id:newId("custom"),name:cleanName,system:false};
  }

  function hasDuplicateColumnName(columns,name,excludeId=null){
    const target=normalizeColumnName(name);
    if(!target)return false;

    return columns.some(column=>
      column.id!==excludeId &&
      normalizeColumnName(column.name)===target
    );
  }

  function cellText(cell){
    if(!cell)return "";
    if(cell.v!==undefined && cell.v!==null)return String(cell.v);
    if(cell.p?.body?.dataStream)return String(cell.p.body.dataStream).replace(/\r?\n$/g,"");
    return "";
  }

  function findManagedSheet(snapshot){
    if(!snapshot?.sheets)return null;
    if(snapshot.sheets[MANAGED_SHEET_ID])return snapshot.sheets[MANAGED_SHEET_ID];
    const firstId=Array.isArray(snapshot.sheetOrder) ? snapshot.sheetOrder[0] : null;
    if(firstId && snapshot.sheets[firstId])return snapshot.sheets[firstId];
    const firstKey=Object.keys(snapshot.sheets)[0];
    return firstKey ? snapshot.sheets[firstKey] : null;
  }

  function valueForColumn(record,column){
    if(column.system)return record[column.field] ?? "";
    return record.custom?.[column.id] ?? "";
  }

  function appendPaperToSnapshot(snapshot,record,columns){
    const sheet=findManagedSheet(snapshot);
    if(!sheet)return;

    sheet.cellData=sheet.cellData || {};
    const headerRow=sheet.cellData[0] || sheet.cellData["0"] || {};
    const columnByName=new Map(columns.map(c=>[normalizeColumnName(c.name),c]));

    let maxUsedRow=0;
    for(const rowKey of Object.keys(sheet.cellData)){
      const row=Number(rowKey);
      if(Number.isFinite(row) && row>maxUsedRow){
        const cells=sheet.cellData[rowKey] || {};
        const hasValue=Object.values(cells).some(cell=>cellText(cell).trim()!=="");
        if(hasValue)maxUsedRow=row;
      }
    }

    const targetRow=Math.max(1,maxUsedRow+1);
    const rowData={};

    for(const [colKey,cell] of Object.entries(headerRow)){
      const name=cellText(cell).normalize("NFKC").trim();
      if(!name)continue;
      const column=columnByName.get(normalizeColumnName(name));
      if(!column)continue;
      const value=String(valueForColumn(record,column) ?? "");
      if(value!=="")rowData[colKey]={v:value};
    }

    sheet.cellData[targetRow]=rowData;
    sheet.rowCount=Math.max(Number(sheet.rowCount)||0,targetRow+50);
  }

  function referenceStylesNeedMigration(groups){
    if(!Array.isArray(groups) || !groups.length)return true;

    return groups.some(group=>{
      if(!group || typeof group!=="object" || Array.isArray(group)){
        return true;
      }

      if(!group.style || typeof group.style!=="object"){
        return true;
      }

      if(!group.formatStyles || typeof group.formatStyles!=="object"){
        return true;
      }

      return REFERENCE_FORMAT_ITEMS.some(item=>{
        const entry=group.formatStyles[item.key];
        return (
          !entry ||
          typeof entry!=="object" ||
          typeof entry.useGroupStyle!=="boolean" ||
          !entry.style ||
          typeof entry.style!=="object"
        );
      });
    });
  }

  class PaperDataStore{
    constructor(rootHandle){
      this.rootHandle=rootHandle;
      this.fileHandle=null;
      this.data=null;
      this.writeQueue=Promise.resolve();
    }

    async open(){
      this.fileHandle=await this.rootHandle.getFileHandle(DATA_FILE_NAME,{create:true});

      const file=await this.fileHandle.getFile();
      const text=(await file.text()).replace(/^\uFEFF/,"").trim();

      if(!text){
        this.data=emptyData();
        await this.save(this.data);
        return {data:this.data,created:true,migrated:false};
      }

      let parsed;
      try{
        parsed=JSON.parse(text);
      }catch(error){
        throw new Error(`${DATA_FILE_NAME} 파일을 읽을 수 없습니다. JSON 형식을 확인하세요.`);
      }

      const needsMigration=
        Number(parsed?.schemaVersion||0)<SCHEMA_VERSION ||
        !Array.isArray(parsed?.referenceFormatGroups) ||
        !parsed.referenceFormatGroups.length ||
        referenceStylesNeedMigration(parsed.referenceFormatGroups);

      this.data=normalizeData(parsed);

      if(needsMigration)await this.save(this.data);

      return {data:this.data,created:false,migrated:needsMigration};
    }

    async reload(){
      if(!this.fileHandle)return this.open();

      const file=await this.fileHandle.getFile();
      const text=(await file.text()).replace(/^\uFEFF/,"").trim();
      this.data=text ? normalizeData(JSON.parse(text)) : emptyData();
      return this.data;
    }

    async save(data=this.data){
      this.data=normalizeData(data);
      this.data.updatedAt=new Date().toISOString();
      const payload=JSON.stringify(this.data,null,2)+"\n";

      const task=async()=>{
        const writable=await this.fileHandle.createWritable();
        await writable.write(payload);
        await writable.close();
        return this.data;
      };

      this.writeQueue=this.writeQueue.then(task,task);
      return this.writeQueue;
    }

    async addPaper(paper){
      if(!this.data)await this.open();

      const record=normalizePaper(paper,this.data.columns);
      this.data.papers.push(record);

      if(this.data.sheetSnapshot){
        appendPaperToSnapshot(this.data.sheetSnapshot,record,this.data.columns);
      }

      await this.save(this.data);
      return record;
    }
  }

  global.ParanPaperData={
    DATA_FILE_NAME,
    SCHEMA_VERSION,
    MANAGED_SHEET_ID,
    SYSTEM_COLUMNS,
    PAPER_FIELDS,
    PaperDataStore,
    normalizePaper,
    normalizeData,
    normalizeColumnName,
    createCustomColumn,
    hasDuplicateColumnName,
    REFERENCE_FORMAT_ITEMS,
    REFERENCE_TEMPLATE_CODES,
    DEFAULT_REFERENCE_STYLE,
    REFERENCE_ALIGNMENTS,
    DEFAULT_REFERENCE_FORMAT_GROUPS,
    cloneDefaultReferenceFormatGroups,
    normalizeReferenceFormatGroup,
    normalizeReferenceFormatGroups,
    normalizeReferenceStyle,
    normalizeFormatStyles,
    effectiveReferenceStyle,
    normalizeReferenceFormatGroupName,
    sanitizeTemplateHtml,
    templateText,
    cellText,
    findManagedSheet
  };
})(window);
