/* 파란 논문 v0.10.8 - 기존 Excel 참고문헌 가져오기 */
(function(global){
  "use strict";

  const HEADER_SCAN_ROWS=20;

  const EXCEL_TYPES=[{
    description:"Excel 참고문헌 파일",
    accept:{
      "application/vnd.ms-excel":[".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"],
      "application/vnd.ms-excel.sheet.macroEnabled.12":[".xlsm"]
    }
  }];

  function normalizeHeader(value){
    if(global.ParanPaperData?.normalizeColumnName){
      return global.ParanPaperData.normalizeColumnName(value);
    }

    return String(value??"")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
  }

  function cleanCell(value){
    if(value===null || value===undefined)return "";

    if(value instanceof Date && !Number.isNaN(value.getTime())){
      const y=value.getFullYear();
      const m=String(value.getMonth()+1).padStart(2,"0");
      const d=String(value.getDate()).padStart(2,"0");
      return `${y}-${m}-${d}`;
    }

    return String(value)
      .replace(/\u00a0/g," ")
      .trim();
  }

  function normalizePdfCell(value){
    return cleanCell(value).replace(/\.pdf$/i,"");
  }

  function currentHeaderMap(currentHeaders){
    const map=new Map();

    for(const raw of currentHeaders||[]){
      const name=String(raw?.name ?? raw ?? "")
        .normalize("NFKC")
        .trim();

      const key=normalizeHeader(name);

      if(name && key && !map.has(key)){
        map.set(key,name);
      }
    }

    return map;
  }

  function rowHeaderMatches(row,headerMap){
    const matched=[];
    const used=new Set();

    for(let column=0;column<(row?.length||0);column++){
      const name=cleanCell(row[column]);
      const key=normalizeHeader(name);

      if(!key || !headerMap.has(key) || used.has(key))continue;

      used.add(key);
      matched.push({
        column,
        key,
        currentName:headerMap.get(key),
        excelName:name
      });
    }

    return matched;
  }

  function detectTableFromMatrices(sheetMatrices,currentHeaders){
    const headerMap=currentHeaderMap(currentHeaders);
    const titleKey=normalizeHeader("논문명");

    if(!headerMap.size){
      throw new Error("현재 논문 목록의 열 정보를 읽지 못했습니다.");
    }

    let best=null;

    for(const item of sheetMatrices||[]){
      const rows=item?.rows || [];
      const max=Math.min(HEADER_SCAN_ROWS,rows.length);

      for(let rowIndex=0;rowIndex<max;rowIndex++){
        const matches=rowHeaderMatches(rows[rowIndex],headerMap);
        const hasTitle=matches.some(match=>match.key===titleKey);

        // 기존 파란 논문 Excel은 12개 열이지만,
        // 형식이 조금 달라도 논문명 포함 3개 이상이 맞으면 후보로 인정한다.
        if(!hasTitle || matches.length<3)continue;

        const candidate={
          sheetName:item.sheetName,
          rows,
          headerRowIndex:rowIndex,
          matches,
          score:matches.length
        };

        if(
          !best ||
          candidate.score>best.score ||
          (
            candidate.score===best.score &&
            candidate.headerRowIndex<best.headerRowIndex
          )
        ){
          best=candidate;
        }
      }
    }

    if(!best){
      throw new Error(
        "엑셀에서 파란 논문 형식의 제목 행을 찾지 못했습니다. " +
        "첫 20행 안에 '논문명'을 포함한 현재 시트의 열 이름이 3개 이상 있어야 합니다."
      );
    }

    const importedRows=[];

    for(
      let rowIndex=best.headerRowIndex+1;
      rowIndex<best.rows.length;
      rowIndex++
    ){
      const source=best.rows[rowIndex] || {};
      const record={};
      let hasValue=false;

      for(const match of best.matches){
        let value=cleanCell(source[match.column]);

        if(match.key===normalizeHeader("PDF")){
          value=normalizePdfCell(value);
        }

        record[match.key]=value;

        if(value!==""){
          hasValue=true;
        }
      }

      // 완전히 빈 행은 가져오지 않는다.
      if(hasValue){
        importedRows.push(record);
      }
    }

    return {
      sheetName:best.sheetName,
      headerRow:best.headerRowIndex+1,
      matchedHeaders:best.matches.map(match=>match.currentName),
      rows:importedRows
    };
  }

  function workbookMatrices(workbook){
    if(!global.XLSX?.utils?.sheet_to_json){
      throw new Error("Excel 읽기 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }

    return (workbook?.SheetNames||[]).map(sheetName=>({
      sheetName,
      rows:global.XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        {
          header:1,
          raw:false,
          defval:"",
          blankrows:true
        }
      )
    }));
  }

  function parseArrayBuffer(arrayBuffer,currentHeaders){
    if(!global.XLSX?.read){
      throw new Error("Excel 읽기 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }

    const workbook=global.XLSX.read(
      arrayBuffer,
      {
        type:"array",
        cellDates:false
      }
    );

    return detectTableFromMatrices(
      workbookMatrices(workbook),
      currentHeaders
    );
  }

  function chooseWithInput(){
    return new Promise((resolve,reject)=>{
      const input=document.createElement("input");
      input.type="file";
      input.accept=".xlsx,.xlsm,.xls";
      input.style.display="none";

      input.onchange=()=>{
        const file=input.files?.[0] || null;
        input.remove();
        resolve(file);
      };

      input.onerror=()=>{
        input.remove();
        reject(new Error("Excel 파일 선택에 실패했습니다."));
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  async function pickExcelFile(startInHandle=null){
    if(typeof global.showOpenFilePicker==="function"){
      const options={
        id:"paran-paper-excel-import",
        multiple:false,
        types:EXCEL_TYPES,
        excludeAcceptAllOption:false
      };

      // 논문 작업 폴더가 이미 연결되어 있으면
      // Excel 파일 선택창을 그 폴더에서 시작한다.
      if(startInHandle){
        options.startIn=startInHandle;
      }

      const handles=await global.showOpenFilePicker(options);

      const handle=handles?.[0];
      if(!handle)return null;

      return {
        file:await handle.getFile(),
        handle
      };
    }

    const file=await chooseWithInput();
    return file ? {file,handle:null} : null;
  }

  async function pickAndParse(currentHeaders,startInHandle=null){
    const picked=await pickExcelFile(startInHandle);

    if(!picked)return null;

    const file=picked.file;
    const name=String(file.name||"");

    if(!/\.(xlsx|xlsm|xls)$/i.test(name)){
      throw new Error("Excel 파일(.xlsx, .xlsm, .xls)을 선택하세요.");
    }

    const result=parseArrayBuffer(
      await file.arrayBuffer(),
      currentHeaders
    );

    return {
      ...result,
      fileName:name
    };
  }

  global.ParanExcelImport=Object.freeze({
    HEADER_SCAN_ROWS,
    normalizeHeader,
    detectTableFromMatrices,
    parseArrayBuffer,
    pickAndParse
  });
})(window);
