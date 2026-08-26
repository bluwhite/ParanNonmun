/* 파란 논문 - PDF 연결/이동 유틸리티 */
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
      // Windows에서 파일명에 사용할 수 없는 문자와 제어문자를 공백으로.
      .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g," ")
      .replace(/\s+/g," ")
      .trim()
      .replace(/[. ]+$/g,"");

    if(!name)name="논문";

    // Windows 예약 파일명은 그대로 만들 수 없으므로 의미를 보존해 피한다.
    if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)){
      name=`${name} 논문`;
    }

    // 지나치게 긴 제목은 경로 제한을 피하기 위해 보수적으로 줄인다.
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
      return {
        baseName:base,
        fileName:candidate
      };
    }

    for(let index=2;index<10000;index++){
      const nextBase=`${base} (${index})`;
      candidate=`${nextBase}.pdf`;

      if(!await existsFile(dirHandle,candidate)){
        return {
          baseName:nextBase,
          fileName:candidate
        };
      }
    }

    throw new Error("같은 이름의 PDF가 너무 많아 새 파일명을 만들 수 없습니다.");
  }

  async function verifyDirectChild(folderHandle,fileHandle){
    let direct;

    try{
      direct=await folderHandle.getFileHandle(fileHandle.name);
    }catch(error){
      if(error?.name==="NotFoundError")return null;
      throw error;
    }

    if(typeof direct.isSameEntry==="function"){
      const same=await direct.isSameEntry(fileHandle);
      return same ? direct : null;
    }

    // isSameEntry가 없는 환경에서는 이름 기준으로만 확인.
    return direct;
  }

  async function pickPdfFromDownloadFolder(downloadHandle){
    if(typeof global.showOpenFilePicker!=="function"){
      throw new Error("현재 브라우저에서는 PDF 파일 선택 기능을 사용할 수 없습니다. Chrome 또는 Edge 최신 버전을 사용하세요.");
    }

    const handles=await global.showOpenFilePicker({
      id:"paran-paper-pdf-picker",
      startIn:downloadHandle,
      multiple:false,
      types:[PDF_TYPE],
      excludeAcceptAllOption:true
    });

    const selected=handles?.[0];
    if(!selected)return null;

    if(!selected.name.toLowerCase().endsWith(".pdf")){
      throw new Error("PDF 파일만 선택할 수 있습니다.");
    }

    const direct=await verifyDirectChild(downloadHandle,selected);

    if(!direct){
      throw new Error("지정한 다운로드 폴더의 바로 아래에 있는 PDF 파일을 선택하세요.");
    }

    return {
      fileHandle:direct,
      fileName:direct.name
    };
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
      // File은 Blob이므로 파일 전체를 별도 ArrayBuffer로 복사하지 않는다.
      await writable.write(sourceFile);
    }catch(error){
      try{await writable.abort?.();}catch(_e){}
      try{await libraryHandle.removeEntry(target.fileName);}catch(_e){}
      throw error;
    }finally{
      try{await writable.close();}catch(_e){}
    }

    return {
      ...target,
      fileHandle:targetHandle
    };
  }

  async function removeSourceFile(downloadHandle,fileName){
    try{
      await downloadHandle.removeEntry(fileName);
      return true;
    }catch(error){
      console.warn("원본 PDF 삭제 실패:",error);
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

    // 먼저 정확한 상대경로를 찾는다.
    for(const pdf of pdfList||[]){
      const path=String(pdf.path||"").replaceAll("\\","/").toLocaleLowerCase();
      if(candidates.includes(path))return pdf.path;
    }

    // 기존 데이터 호환: PDF 열에 파일명만 저장된 경우.
    for(const pdf of pdfList||[]){
      const name=String(pdf.name||"").toLocaleLowerCase();
      if(candidates.includes(name))return pdf.path;
    }

    return null;
  }

  global.ParanPdfLink=Object.freeze({
    cleanTitleForFileName,
    pickPdfFromDownloadFolder,
    copyPdfToLibrary,
    removeSourceFile,
    findPdfPath,
    pdfCellCandidates
  });
})(window);
