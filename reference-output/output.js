/* 파란 논문 v0.12.0 - 참고문헌 출력 */
(function(global){
  "use strict";

  const $=id=>document.getElementById(id);

  const FORMAT_KEY_BY_CHECK=new Map([
    ["학회지_국내","journalKo"],
    ["학위_국내","thesisKo"],
    ["단행본_국내","bookKo"],
    ["학회지_해외","journalEn"],
    ["학위_해외","thesisEn"],
    ["단행본_해외","bookEn"]
  ]);

  const TOKEN_ORDER=[
    "VL(IS)",
    "VL+IS",
    "VL/IS",
    "AU","PY","TI","JO","VL","IS","PB","SP","EP"
  ];

  const TOKEN_PATTERN=new RegExp(
    TOKEN_ORDER
      .map(token=>token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))
      .join("|"),
    "g"
  );

  let groups=[];
  let papers=[];
  let selectedGroupId=null;
  let currentOrderMode="sheet";
  let initialized=false;

  function clean(value){
    return String(value??"").trim();
  }

  function formatDomesticVolumeIssue(volume,issue){
    const v=clean(volume);
    const i=clean(issue);

    if(v && i)return `제${v}권 제${i}호`;
    if(v)return `제${v}권`;
    if(i)return `제${i}집`;
    return "";
  }

  function formatParenVolumeIssue(volume,issue){
    const v=clean(volume);
    const i=clean(issue);

    if(v && i)return `${v}(${i})`;
    if(v)return v;
    if(i)return i;
    return "";
  }

  function formatSlashVolumeIssue(volume,issue){
    const v=clean(volume);
    const i=clean(issue);

    if(v && i)return `${v}/${i}`;
    if(v)return v;
    if(i)return i;
    return "";
  }

  function tokenValues(paper){
    return {
      "AU":clean(paper.authors),
      "PY":clean(paper.year),
      "TI":clean(paper.title),
      "JO":clean(paper.journal),
      "VL":clean(paper.volume),
      "IS":clean(paper.issue),
      "PB":clean(paper.publisher),
      "SP":clean(paper.startPage),
      "EP":clean(paper.endPage),
      "VL+IS":formatDomesticVolumeIssue(
        paper.volume,
        paper.issue
      ),
      "VL(IS)":formatParenVolumeIssue(
        paper.volume,
        paper.issue
      ),
      "VL/IS":formatSlashVolumeIssue(
        paper.volume,
        paper.issue
      )
    };
  }

  function chooseFormatKey(paper){
    const check=clean(paper.check);

    if(!check)return null;

    if(check==="*"){
      const journal=clean(paper.journal);

      if(/석사|박사|학위논문/i.test(journal)){
        return "thesisKo";
      }

      // 기존 VBA의 * 동작을 유지:
      // 학위논문이 아니면 국내 학회지 형식.
      return "journalKo";
    }

    return FORMAT_KEY_BY_CHECK.get(check) || null;
  }

  function replaceTokensInTemplate(templateHtml,paper){
    const box=document.createElement("div");
    box.innerHTML=
      global.ParanPaperData.sanitizeTemplateHtml(
        templateHtml
      );

    const values=tokenValues(paper);

    const walker=document.createTreeWalker(
      box,
      NodeFilter.SHOW_TEXT
    );

    const nodes=[];
    let node;

    while((node=walker.nextNode())){
      nodes.push(node);
    }

    for(const textNode of nodes){
      textNode.nodeValue=String(textNode.nodeValue||"")
        .replace(
          TOKEN_PATTERN,
          token=>values[token] ?? ""
        )
        .replace(/[ \t]{2,}/g," ");
    }

    return box.innerHTML.trim();
  }

  function plainTextFromHtml(html){
    const box=document.createElement("div");
    box.innerHTML=html;
    return String(box.textContent||"")
      .replace(/\u00a0/g," ")
      .replace(/[ \t]{2,}/g," ")
      .trim();
  }

  function languageGroup(paper,plainText){
    const source=
      clean(paper.authors) ||
      clean(paper.title) ||
      clean(plainText);

    const firstLetter=
      source.match(/[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z\u00C0-\u024F]/)?.[0] || "";

    return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(firstLetter)
      ? 0
      : 1;
  }

  function sortKeyFor(paper,plainText){
    return (
      clean(paper.authors) ||
      clean(paper.title) ||
      clean(plainText)
    ).normalize("NFKC");
  }

  function selectedGroup(){
    return groups.find(
      group=>group.id===selectedGroupId
    ) || groups[0] || null;
  }

  function setState(message,kind=""){
    const el=$("referenceOutputState");
    if(!el)return;

    el.textContent=message;
    el.className=
      `reference-output-state ${kind}`.trim();
  }

  function setCount(){
    const count=$("referenceOutputArea")
      .querySelectorAll(".reference-output-item")
      .length;

    $("referenceOutputCount").textContent=
      `${count}편`;
  }

  function renderGroupOptions(){
    const select=$("referenceOutputGroup");
    select.replaceChildren();

    for(const group of groups){
      const option=document.createElement("option");
      option.value=group.id;
      option.textContent=group.name;
      select.append(option);
    }

    if(
      selectedGroupId &&
      groups.some(group=>group.id===selectedGroupId)
    ){
      select.value=selectedGroupId;
    }else if(groups[0]){
      selectedGroupId=groups[0].id;
      select.value=selectedGroupId;
    }
  }

  function makeReferenceElement(
    paper,
    html,
    sheetIndex,
    formatKey
  ){
    const item=document.createElement("div");
    item.className="reference-output-item";
    item.contentEditable="true";
    item.spellcheck=false;

    const plain=plainTextFromHtml(html);

    item.dataset.sheetOrder=String(sheetIndex);
    item.dataset.languageGroup=String(
      languageGroup(paper,plain)
    );
    item.dataset.sortKey=sortKeyFor(
      paper,
      plain
    );
    item.dataset.formatKey=formatKey;

    item.innerHTML=html;

    return item;
  }

  function generate(){
    const group=selectedGroup();

    if(!group){
      setState(
        "사용할 참고문헌 양식 그룹이 없습니다.",
        "error"
      );
      return;
    }

    const area=$("referenceOutputArea");
    area.replaceChildren();

    let unsupported=0;
    let targetCount=0;

    papers.forEach((paper,index)=>{
      const check=clean(paper.check);
      if(!check)return;

      targetCount++;

      const key=chooseFormatKey(paper);

      if(!key){
        unsupported++;
        return;
      }

      const template=group.formats?.[key];

      if(!template){
        unsupported++;
        return;
      }

      const html=replaceTokensInTemplate(
        template,
        paper
      );

      const item=makeReferenceElement(
        paper,
        html,
        index,
        key
      );

      area.append(item);
    });

    currentOrderMode="sheet";
    updateOrderButtons();
    setCount();

    const count=
      area.querySelectorAll(
        ".reference-output-item"
      ).length;

    if(!targetCount){
      setState(
        "확인(*) 값이 있는 논문이 없습니다.",
        "error"
      );
      return;
    }

    if(!count){
      setState(
        "출력 가능한 참고문헌이 없습니다. 확인(*) 값을 확인하세요.",
        "error"
      );
      return;
    }

    if(unsupported){
      setState(
        `${group.name} · ${count}편 생성 · 지원하지 않는 확인(*) 값 ${unsupported}편 제외`,
        "warning"
      );
    }else{
      setState(
        `${group.name} · ${count}편 · 현재 시트 순서`,
        "saved"
      );
    }
  }

  function updateOrderButtons(){
    $("referenceSheetOrderBtn")
      .classList.toggle(
        "active-order",
        currentOrderMode==="sheet"
      );

    $("referenceSortBtn")
      .classList.toggle(
        "active-order",
        currentOrderMode==="sorted"
      );
  }

  function restoreSheetOrder(){
    const area=$("referenceOutputArea");
    const items=[
      ...area.querySelectorAll(
        ".reference-output-item"
      )
    ];

    items.sort(
      (a,b)=>
        Number(a.dataset.sheetOrder)-
        Number(b.dataset.sheetOrder)
    );

    area.append(...items);

    currentOrderMode="sheet";
    updateOrderButtons();

    setState(
      `${items.length}편 · 시트 순서`,
      "saved"
    );
  }

  function sortKoreanFirst(){
    const area=$("referenceOutputArea");
    const items=[
      ...area.querySelectorAll(
        ".reference-output-item"
      )
    ];

    const koCollator=new Intl.Collator(
      "ko-KR",
      {
        sensitivity:"base",
        numeric:true
      }
    );

    const otherCollator=new Intl.Collator(
      "en",
      {
        sensitivity:"base",
        numeric:true
      }
    );

    items.sort((a,b)=>{
      const ga=Number(a.dataset.languageGroup);
      const gb=Number(b.dataset.languageGroup);

      if(ga!==gb)return ga-gb;

      const ka=a.dataset.sortKey || "";
      const kb=b.dataset.sortKey || "";

      const compared=
        ga===0
          ? koCollator.compare(ka,kb)
          : otherCollator.compare(ka,kb);

      if(compared!==0)return compared;

      return (
        Number(a.dataset.sheetOrder)-
        Number(b.dataset.sheetOrder)
      );
    });

    area.append(...items);

    currentOrderMode="sorted";
    updateOrderButtons();

    setState(
      `${items.length}편 · 한글 먼저 정렬`,
      "saved"
    );
  }

  function plainOutputText(){
    return [
      ...$("referenceOutputArea")
        .querySelectorAll(
          ".reference-output-item"
        )
    ]
      .map(item=>
        String(item.innerText||"").trim()
      )
      .filter(Boolean)
      .join("\n");
  }

  function richOutputHtml(){
    const items=[
      ...$("referenceOutputArea")
        .querySelectorAll(
          ".reference-output-item"
        )
    ];

    const body=items
      .map(item=>
        `<p style="margin:0 0 0.65em 0;">${item.innerHTML}</p>`
      )
      .join("");

    return (
      '<div style="font-family:Arial,\'Malgun Gothic\',sans-serif;'+
      'font-size:11pt;line-height:1.5;">'+
      body+
      "</div>"
    );
  }


  function hwpHtmlFromCurrentOutput(){
    const items=[
      ...$("referenceOutputArea")
        .querySelectorAll(".reference-output-item")
    ];

    const rows=items.map(item=>{
      const box=document.createElement("div");
      box.innerHTML=item.innerHTML;

      // 한글 테스트용: 이탤릭은 <em> 대신 정확히 <i> 태그로 변환한다.
      for(const em of box.querySelectorAll("em")){
        const italic=document.createElement("i");
        italic.innerHTML=em.innerHTML;
        em.replaceWith(italic);
      }

      // 사용자가 출력 결과에서 직접 이탤릭을 준 요소도 <i>로 정규화한다.
      for(const element of [...box.querySelectorAll("*")]){
        try{
          if(
            element.tagName.toLowerCase()!=="i" &&
            getComputedStyle(element).fontStyle==="italic"
          ){
            const italic=document.createElement("i");
            italic.innerHTML=element.innerHTML;
            element.replaceWith(italic);
          }
        }catch(_e){}
      }

      return `<div>${box.innerHTML}</div>`;
    });

    return (
      '<html><head><meta charset="utf-8"></head><body>'+
      '<!--StartFragment-->'+
      rows.join("")+
      '<!--EndFragment-->'+
      "</body></html>"
    );
  }

  function copyForHwp(){
    const plain=plainOutputText();

    if(!plain){
      setState(
        "복사할 참고문헌이 없습니다.",
        "error"
      );
      return;
    }

    const html=hwpHtmlFromCurrentOutput();

    let handled=false;

    const onCopy=event=>{
      try{
        if(!event.clipboardData)return;

        // 핵심 테스트:
        // 브라우저의 실제 copy 이벤트 안에서 text/html을 직접 등록한다.
        // 이 경로를 통해 Windows에서는 CF_HTML(HTML Format)으로
        // 변환되는지 아래한글에서 확인한다.
        event.clipboardData.clearData();
        event.clipboardData.setData(
          "text/html",
          html
        );
        event.clipboardData.setData(
          "text/plain",
          plain
        );

        event.preventDefault();
        handled=true;
      }catch(error){
        console.error(
          "한글용 copy 이벤트 처리 실패:",
          error
        );
      }
    };

    document.addEventListener(
      "copy",
      onCopy,
      {capture:true,once:true}
    );

    try{
      // user gesture 안에서 동기식 copy 이벤트를 발생시킨다.
      const ok=document.execCommand("copy");

      if(!ok || !handled){
        throw new Error(
          "브라우저가 HTML Format용 copy 이벤트를 처리하지 않았습니다."
        );
      }

      setState(
        "한글용 복사 완료 · copy 이벤트에 <i> HTML을 직접 등록했습니다. 아래한글에서 Ctrl+V로 테스트하세요.",
        "saved"
      );
    }catch(error){
      console.error(error);

      // once:true listener가 아직 실행되지 않았다면 제거한다.
      try{
        document.removeEventListener(
          "copy",
          onCopy,
          true
        );
      }catch(_e){}

      setState(
        `한글용 복사 실패: ${error.message}`,
        "error"
      );
    }
  }

  async function fallbackRichCopy(){
    const area=$("referenceOutputArea");
    const selection=window.getSelection();
    const savedRanges=[];

    if(selection){
      for(let i=0;i<selection.rangeCount;i++){
        savedRanges.push(
          selection.getRangeAt(i).cloneRange()
        );
      }
    }

    const range=document.createRange();
    range.selectNodeContents(area);

    selection.removeAllRanges();
    selection.addRange(range);

    const ok=document.execCommand("copy");

    selection.removeAllRanges();
    for(const oldRange of savedRanges){
      selection.addRange(oldRange);
    }

    if(!ok){
      throw new Error(
        "브라우저가 서식 포함 복사를 허용하지 않았습니다."
      );
    }
  }

  async function copyRich(){
    const plain=plainOutputText();

    if(!plain){
      setState(
        "복사할 참고문헌이 없습니다.",
        "error"
      );
      return;
    }

    const html=richOutputHtml();

    try{
      if(
        navigator.clipboard?.write &&
        global.ClipboardItem
      ){
        const item=new ClipboardItem({
          "text/plain":new Blob(
            [plain],
            {type:"text/plain"}
          ),
          "text/html":new Blob(
            [html],
            {type:"text/html"}
          )
        });

        await navigator.clipboard.write([item]);
      }else{
        await fallbackRichCopy();
      }

      setState(
        "서식 포함 복사 완료 · Word/한글에 붙여 넣으세요.",
        "saved"
      );
    }catch(error){
      console.error(error);

      try{
        await fallbackRichCopy();
        setState(
          "서식 포함 복사 완료 · Word/한글에 붙여 넣으세요.",
          "saved"
        );
      }catch(fallbackError){
        console.error(fallbackError);
        setState(
          `서식 포함 복사 실패: ${fallbackError.message}`,
          "error"
        );
      }
    }
  }

  async function copyPlain(){
    const plain=plainOutputText();

    if(!plain){
      setState(
        "복사할 참고문헌이 없습니다.",
        "error"
      );
      return;
    }

    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(plain);
      }else{
        const textarea=document.createElement("textarea");
        textarea.value=plain;
        textarea.style.position="fixed";
        textarea.style.opacity="0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setState(
        "일반 텍스트 복사 완료",
        "saved"
      );
    }catch(error){
      console.error(error);
      setState(
        `텍스트 복사 실패: ${error.message}`,
        "error"
      );
    }
  }

  function close(){
    $("referenceOutputDialog").close();
  }

  function bind(){
    if(initialized)return;
    initialized=true;

    $("referenceOutputGroup")
      .addEventListener(
        "change",
        event=>{
          selectedGroupId=event.target.value;
          generate();
        }
      );

    $("referenceGenerateBtn").onclick=generate;
    $("referenceSortBtn").onclick=sortKoreanFirst;
    $("referenceSheetOrderBtn").onclick=restoreSheetOrder;
    $("referenceCopyBtn").onclick=copyRich;
    $("referenceHwpCopyBtn").onclick=copyForHwp;
    $("referencePlainCopyBtn").onclick=copyPlain;
    $("referenceOutputCloseBtn").onclick=close;
    $("referenceOutputCloseIconBtn").onclick=close;

    $("referenceOutputDialog").addEventListener(
      "cancel",
      event=>{
        event.preventDefault();
        close();
      }
    );
  }

  function open(options={}){
    bind();

    groups=
      global.ParanPaperData.normalizeReferenceFormatGroups(
        options.groups
      );

    papers=Array.isArray(options.papers)
      ? options.papers
      : [];

    if(
      options.selectedGroupId &&
      groups.some(
        group=>group.id===options.selectedGroupId
      )
    ){
      selectedGroupId=options.selectedGroupId;
    }else if(
      selectedGroupId &&
      groups.some(
        group=>group.id===selectedGroupId
      )
    ){
      // 현재 세션에서 마지막으로 선택한 그룹을 유지한다.
    }else{
      selectedGroupId=groups[0]?.id || null;
    }

    renderGroupOptions();
    $("referenceOutputDialog").showModal();
    generate();
  }

  global.ParanReferenceOutput=Object.freeze({
    open,
    chooseFormatKey,
    replaceTokensInTemplate,
    formatDomesticVolumeIssue,
    formatParenVolumeIssue,
    formatSlashVolumeIssue
  });
})(window);
