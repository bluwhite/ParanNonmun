/* 파란 논문 로컬 데이터 저장 모듈 */
(function(global){
  "use strict";

  const DATA_FILE_NAME = "파란논문.json";
  const SCHEMA_VERSION = 2;

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
        // 시스템 열 이름은 고정하고 순서만 사용자가 바꿀 수 있다.
        const normalizedName=normalizeColumnName(systemDef.name);
        if(usedNames.has(normalizedName))continue;
        result.push({...systemDef});
        usedIds.add(id);
        usedNames.add(normalizedName);
      }else{
        const normalizedName=normalizeColumnName(name);
        if(!normalizedName || usedNames.has(normalizedName))continue;

        result.push({
          id,
          name,
          system:false
        });
        usedIds.add(id);
        usedNames.add(normalizedName);
      }
    }

    // 예전 데이터나 손상된 파일에서도 필수 시스템 열은 항상 복구한다.
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

    // 현재 존재하는 사용자 열만 유지한다.
    const customIds=new Set(
      columns.filter(c=>!c.system).map(c=>c.id)
    );
    for(const key of Object.keys(result.custom)){
      if(!customIds.has(key))delete result.custom[key];
    }

    return result;
  }

  function emptyData(){
    const columns=cloneSystemColumns();
    return {
      app:"파란 논문",
      schemaVersion:SCHEMA_VERSION,
      updatedAt:new Date().toISOString(),
      columns,
      papers:[]
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
    }

    return normalized;
  }

  function createCustomColumn(name){
    const cleanName=String(name ?? "").normalize("NFKC").trim();
    if(!cleanName)throw new Error("열 이름을 입력하세요.");

    return {
      id:newId("custom"),
      name:cleanName,
      system:false
    };
  }

  function hasDuplicateColumnName(columns,name,excludeId=null){
    const target=normalizeColumnName(name);
    if(!target)return false;

    return columns.some(column=>
      column.id!==excludeId &&
      normalizeColumnName(column.name)===target
    );
  }

  class PaperDataStore{
    constructor(rootHandle){
      this.rootHandle=rootHandle;
      this.fileHandle=null;
      this.data=null;
      this.writeQueue=Promise.resolve();
    }

    async open(){
      this.fileHandle=await this.rootHandle.getFileHandle(
        DATA_FILE_NAME,
        {create:true}
      );

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
        throw new Error(
          `${DATA_FILE_NAME} 파일을 읽을 수 없습니다. JSON 형식을 확인하세요.`
        );
      }

      const needsMigration=
        Number(parsed?.schemaVersion||0)<SCHEMA_VERSION ||
        !Array.isArray(parsed?.columns);

      this.data=normalizeData(parsed);

      if(needsMigration){
        await this.save(this.data);
      }

      return {
        data:this.data,
        created:false,
        migrated:needsMigration
      };
    }

    async reload(){
      if(!this.fileHandle)return this.open();

      const file=await this.fileHandle.getFile();
      const text=(await file.text()).replace(/^\uFEFF/,"").trim();

      this.data=text
        ? normalizeData(JSON.parse(text))
        : emptyData();

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

      await this.save(this.data);
      return record;
    }
  }

  global.ParanPaperData={
    DATA_FILE_NAME,
    SCHEMA_VERSION,
    SYSTEM_COLUMNS,
    PAPER_FIELDS,
    PaperDataStore,
    normalizePaper,
    normalizeData,
    normalizeColumnName,
    createCustomColumn,
    hasDuplicateColumnName
  };
})(window);
