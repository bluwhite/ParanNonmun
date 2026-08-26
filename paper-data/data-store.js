/* 파란 논문 로컬 데이터 저장 모듈 */
(function(global){
  "use strict";

  const DATA_FILE_NAME = "파란논문.json";
  const SCHEMA_VERSION = 4;
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


  const REFERENCE_FORMAT_TOKENS = [
    {token:"AU",label:"저자"},
    {token:"PY",label:"출판연도"},
    {token:"TI",label:"논문명"},
    {token:"JO",label:"학술지명"},
    {token:"VL",label:"권"},
    {token:"IS",label:"호"},
    {token:"PB",label:"학회명/발행기관"},
    {token:"SP",label:"시작페이지"},
    {token:"EP",label:"끝페이지"},
    {token:"VL+IS",label:"권·호(국내식)"},
    {token:"VL(IS)",label:"권(호)"}
  ];

  const REFERENCE_FORMAT_TOKEN_SET =
    new Set(REFERENCE_FORMAT_TOKENS.map(item=>item.token));

  const DEFAULT_REFERENCE_FORMATS = [
    {
      id:"journal-ko",
      name:"학회지_국내",
      template:"AU(PY), 「TI」, 『JO』 VL+IS, PB, pp.SP-EP.",
      italicTokens:[]
    },
    {
      id:"thesis-ko",
      name:"학위_국내",
      template:"AU(PY), 「TI」, JO.",
      italicTokens:[]
    },
    {
      id:"book-ko",
      name:"단행본_국내",
      template:"AU(PY), 「TI」, JO.",
      italicTokens:[]
    },
    {
      id:"journal-en",
      name:"학회지_해외",
      template:"AU(PY), TI, JO VL+IS, SP-EP.",
      italicTokens:["JO"]
    },
    {
      id:"thesis-en",
      name:"학위_해외",
      template:"AU(PY), TI, JO.",
      italicTokens:["TI"]
    },
    {
      id:"book-en",
      name:"단행본_해외",
      template:"AU(PY), TI, JO.",
      italicTokens:["TI"]
    }
  ];

  function cloneDefaultReferenceFormats(){
    return DEFAULT_REFERENCE_FORMATS.map(format=>({
      ...format,
      italicTokens:[...format.italicTokens]
    }));
  }

  function normalizeReferenceFormatName(name){
    return String(name??"")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
  }

  function normalizeReferenceFormat(raw={}){
    const id=String(raw.id||"").trim() || newId("ref-format");
    const name=String(raw.name||"").normalize("NFKC").trim();
    const template=String(raw.template||"")
      .replace(/\r\n?/g,"\n")
      .trim();

    const italicTokens=[];
    const seen=new Set();

    for(const token of Array.isArray(raw.italicTokens) ? raw.italicTokens : []){
      const clean=String(token||"").trim();

      if(
        REFERENCE_FORMAT_TOKEN_SET.has(clean) &&
        !seen.has(clean)
      ){
        italicTokens.push(clean);
        seen.add(clean);
      }
    }

    return {
      id,
      name,
      template,
      italicTokens
    };
  }

  function normalizeReferenceFormats(formats){
    if(!Array.isArray(formats))return cloneDefaultReferenceFormats();

    const result=[];
    const usedIds=new Set();
    const usedNames=new Set();

    for(const raw of formats){
      const format=normalizeReferenceFormat(raw);

      if(!format.name || !format.template)continue;

      let id=format.id;
      while(usedIds.has(id)){
        id=newId("ref-format");
      }

      const nameKey=normalizeReferenceFormatName(format.name);
      if(!nameKey || usedNames.has(nameKey))continue;

      result.push({
        ...format,
        id
      });

      usedIds.add(id);
      usedNames.add(nameKey);
    }

    return result;
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
      referenceFormats:cloneDefaultReferenceFormats()
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

      if(Object.prototype.hasOwnProperty.call(data,"referenceFormats")){
        normalized.referenceFormats=
          normalizeReferenceFormats(data.referenceFormats);
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

      const needsMigration=Number(parsed?.schemaVersion||0)<SCHEMA_VERSION;
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
    REFERENCE_FORMAT_TOKENS,
    DEFAULT_REFERENCE_FORMATS,
    cloneDefaultReferenceFormats,
    normalizeReferenceFormat,
    normalizeReferenceFormats,
    normalizeReferenceFormatName,
    cellText,
    findManagedSheet
  };
})(window);
