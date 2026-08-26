/* 파란 논문 로컬 데이터 저장 모듈 */
(function(global){
  "use strict";

  const DATA_FILE_NAME = "파란논문.json";
  const SCHEMA_VERSION = 1;
  const PAPER_FIELDS = [
    "check","authors","year","title","journal","volume","issue",
    "publisher","startPage","endPage","memo","pdf"
  ];

  function newId(){
    if(global.crypto && typeof global.crypto.randomUUID === "function"){
      return global.crypto.randomUUID();
    }
    return `paper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizePaper(paper={}){
    const result={id:paper.id || newId()};
    for(const field of PAPER_FIELDS){
      result[field]=paper[field] == null ? "" : String(paper[field]);
    }
    return result;
  }

  function emptyData(){
    return {
      app:"파란 논문",
      schemaVersion:SCHEMA_VERSION,
      updatedAt:new Date().toISOString(),
      papers:[]
    };
  }

  function normalizeData(data){
    const normalized=emptyData();
    if(data && typeof data === "object"){
      normalized.updatedAt=data.updatedAt || normalized.updatedAt;
      normalized.papers=Array.isArray(data.papers)
        ? data.papers.map(normalizePaper)
        : [];
    }
    return normalized;
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
        return {data:this.data,created:true};
      }

      try{
        this.data=normalizeData(JSON.parse(text));
      }catch(error){
        throw new Error(`${DATA_FILE_NAME} 파일을 읽을 수 없습니다. JSON 형식을 확인하세요.`);
      }

      return {data:this.data,created:false};
    }

    async reload(){
      if(!this.fileHandle) return this.open();
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
      if(!this.data) await this.open();
      const record=normalizePaper(paper);
      this.data.papers.push(record);
      await this.save(this.data);
      return record;
    }
  }

  global.ParanPaperData={
    DATA_FILE_NAME,
    PAPER_FIELDS,
    PaperDataStore,
    normalizePaper
  };
})(window);
