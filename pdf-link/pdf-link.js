/* 파란 논문 v0.10.6 - PDF 연결/이동 유틸리티 */
(function(global){
  "use strict";

  const PDF_TYPE={
    description:"PDF",
    accept:{
      "application/pdf":[".pdf"]
    }
  };

  function cleanTitleForFileName(value){
    let name=String(value??"")
      .normalize("NFKC")
      .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g," ")
      .replace(/\s+/g," ")
      .trim()
      .replace(/[. ]+$/g,"");

    if(!name)name="논문";

    if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)){
      name=`${name} 논문`;
    }

    if(name.length>170){
      name=name.slice(0,170).trim().replace(/[. ]+$/g,"");
    }

    return name || "논문";
  }

  async function existsFile(dirHandle,fileName){
    try{
      await dirHandle.getFileHandle(fileName);
      return true;
    }catch(error){
      if(error?.name==="NotFoundError")return false;
      throw error;
    }
  }

  async function uniquePdfName(dirHandle,title){
    const base=cleanTitleForFileName(title);

    let candidate=`${base}.pdf`;
    if(!await existsFile(dirHandle,candidate)){
      return {baseName:base,fileName:candidate};
    }

    for(let index=2;index<10000;index++){
      const nextBase=`${base} (${index})`;
      candidate=`${nextBase}.pdf`;

      if(!await existsFile(dirHandle,candidate)){
        return {baseName:nextBase,fileName:candidate};
      }
    }

    throw new Error("같은 이름의 PDF가 너무 많아 새 파일명을 만들 수 없습니다.");
  }

  async function pickPdf(){
    if(typeof global.showOpenFilePicker!=="function"){
      throw new Error(
        "현재 브라우저에서는 PDF 파일 선택 기능을 사용할 수 없습니다. Chrome 또는 Edge 최신 버전을 사용하세요."
      );
    }

    const handles=await global.showOpenFilePicker({
      id:"paran-paper-download-pdf",
      startIn:"downloads",
      multiple:false,
      types:[PDF_TYPE],
      excludeAcceptAllOption:true
    });

    const selected=handles?.[0];
    if(!selected)return null;

    if(!selected.name.toLowerCase().endsWith(".pdf")){
      throw new Error("PDF 파일만 선택할 수 있습니다.");
    }

    return {
      fileHandle:selected,
      fileName:selected.name
    };
  }

  async function rememberDownloadLocation(){
    // 같은 picker id를 사용하면 브라우저가 최근 열었던 위치를 기억한다.
    // 여기서는 파일을 선택만 하고 내용 변경/이동은 하지 않는다.
    return pickPdf();
  }

  async function copyPdfToLibrary(sourceFileHandle,libraryHandle,title){
    const sourceFile=await sourceFileHandle.getFile();
    const target=await uniquePdfName(libraryHandle,title);

    const targetHandle=await libraryHandle.getFileHandle(
      target.fileName,
      {create:true}
    );

    const writable=await targetHandle.createWritable();

    try{
      await writable.write(sourceFile);
      await writable.close();
    }catch(error){
      try{await writable.abort?.();}catch(_e){}
      try{await libraryHandle.removeEntry(target.fileName);}catch(_e){}
      throw error;
    }

    return {
      ...target,
      fileHandle:targetHandle
    };
  }

  async function removeSourceFile(fileHandle){
    if(!fileHandle)return false;

    if(typeof fileHandle.remove!=="function"){
      return false;
    }

    try{
      let permission="prompt";

      if(typeof fileHandle.queryPermission==="function"){
        permission=await fileHandle.queryPermission({mode:"readwrite"});
      }

      if(
        permission!=="granted" &&
        typeof fileHandle.requestPermission==="function"
      ){
        permission=await fileHandle.requestPermission({mode:"readwrite"});
      }

      if(permission!=="granted"){
        return false;
      }

      await fileHandle.remove();
      return true;
    }catch(error){
      console.warn("선택한 원본 PDF 삭제 실패:",error);
      return false;
    }
  }

  function pdfCellCandidates(value){
    const raw=String(value??"")
      .trim()
      .replaceAll("\\","/");

    if(!raw)return [];

    const result=[raw];

    if(!/\.pdf$/i.test(raw)){
      result.push(`${raw}.pdf`);
    }

    return [...new Set(result)];
  }

  function findPdfPath(pdfList,value){
    const candidates=pdfCellCandidates(value)
      .map(v=>v.toLocaleLowerCase());

    if(!candidates.length)return null;

    for(const pdf of pdfList||[]){
      const path=String(pdf.path||"")
        .replaceAll("\\","/")
        .toLocaleLowerCase();

      if(candidates.includes(path))return pdf.path;
    }

    for(const pdf of pdfList||[]){
      const name=String(pdf.name||"").toLocaleLowerCase();
      if(candidates.includes(name))return pdf.path;
    }

    return null;
  }

  global.ParanPdfLink=Object.freeze({
    cleanTitleForFileName,
    pickPdf,
    rememberDownloadLocation,
    copyPdfToLibrary,
    removeSourceFile,
    findPdfPath,
    pdfCellCandidates
  });
})(window);
