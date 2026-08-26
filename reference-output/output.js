/* 파란 논문 v0.13.9 - 이탤릭 경계 공백 보존 */
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

    // 템플릿의 내부 공백(&nbsp; 포함)은 이미 sanitizer에서
    // 의도적으로 보존되므로 여기서는 다시 trim/정규화하지 않는다.
    return box.innerHTML;
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

  function cssFontFamily(value){
    const name=clean(value) || "HCR Dotum";
    const escaped=name.replace(/["\\]/g,"");

    if(/^HCR Dotum$/i.test(name) || name==="함초롬돋움"){
      return '"HCR Dotum","함초롬돋움","Malgun Gothic",sans-serif';
    }

    if(/^HCR Batang$/i.test(name) || name==="함초롬바탕"){
      return '"HCR Batang","함초롬바탕","Batang","바탕",serif';
    }

    const fallback=
      /바탕|serif|times/i.test(name)
        ? "serif"
        : "sans-serif";

    return `"${escaped}",${fallback}`;
  }

  function referenceMetrics(style){
    const s=global.ParanPaperData.normalizeReferenceStyle(style);

    const hanging=Math.max(
      0,
      Number(s.hangingIndentPt)||0
    );

    const firstLineLeft=
      Math.max(
        0,
        Number(s.leftIndentPt)||0
      );

    // Word/CSS의 hanging indent 표현:
    // 본문 왼쪽 위치 = 첫 줄 시작 위치 + hanging
    const wordParagraphLeft=
      firstLineLeft+hanging;

    // 아래한글 '인터넷 문서' 가져오기 실측 결과:
    //
    // CSS margin-left:36pt / text-indent:-30pt
    //   -> 한글 왼쪽 -24pt / 내어쓰기 30pt
    //
    // CSS margin-left:66pt / text-indent:-30pt
    //   -> 한글 왼쪽 6pt / 내어쓰기 30pt
    //
    // 따라서 아래한글용 CSS margin-left는
    //   설정 왼쪽 여백 + (내어쓰기 × 2)
    // 로 변환한다.
    //
    // 이 값은 하드코딩이 아니라 사용자 스타일 값으로 매번 계산된다.
    const hwpMarginLeft=
      firstLineLeft+(hanging*2);

    const fontSizePt=
      Math.max(
        1,
        Number(s.fontSizePt)||10
      );

    const linePercent=
      Math.max(
        80,
        Number(s.lineHeightPercent)||100
      );

    return {
      s,
      hanging,
      firstLineLeft,
      wordParagraphLeft,
      hwpMarginLeft,
      fontSizePt,
      linePercent,
      lineRatio:linePercent/100,
      lineHeightPt:
        fontSizePt*(linePercent/100),
      letterSpacingEm:
        Number(s.letterSpacingPercent||0)/100
    };
  }

  function previewStyleCss(style){
    const {
      s,
      hanging,
      wordParagraphLeft,
      lineRatio,
      letterSpacingEm
    }=referenceMetrics(style);

    return [
      `font-family:${cssFontFamily(s.fontFamily)}`,
      `font-size:${s.fontSizePt}pt`,
      `font-stretch:${s.fontScalePercent}%`,
      `letter-spacing:${letterSpacingEm}em`,
      `line-height:${lineRatio}`,
      `margin-top:${s.spaceBeforePt}pt`,
      `margin-right:${s.rightIndentPt}pt`,
      `margin-bottom:${s.spaceAfterPt}pt`,
      `margin-left:${wordParagraphLeft}pt`,
      "padding:0",
      `text-indent:-${hanging}pt`,
      `text-align:${s.alignment}`,
      "font-weight:normal"
    ].join(";");
  }

  function hwpParagraphCss(style){
    const {
      s,
      hanging,
      hwpMarginLeft,
      linePercent
    }=referenceMetrics(style);

    // 실제 아래한글 import 테스트 결과:
    //
    // A: margin-left:36pt / text-indent:-30pt
    //    -> 왼쪽 -24pt / 내어쓰기 30pt
    //
    // B: margin-left:66pt / text-indent:-30pt
    //    -> 왼쪽 6pt / 내어쓰기 30pt  (정상)
    //
    // 따라서 일반화한 공식:
    //   HWP용 margin-left =
    //     설정 왼쪽 여백 + (내어쓰기 × 2)
    //
    // 예:
    //   왼쪽 6pt + 내어쓰기 30pt
    //   -> 6 + 60 = 66pt
    //
    // 사용자가 값을 바꾸면 자동으로 다시 계산된다.
    //
    // 한컴이 자체적으로 생성하는 HTML과 비슷하게:
    // - p class="HStyle0"
    // - line-height:180%
    // - mso-pagination:none
    // - mso-padding-alt
    // 를 사용한다.
    return [
      `margin-top:${s.spaceBeforePt}pt`,
      `margin-right:${s.rightIndentPt}pt`,
      `margin-bottom:${s.spaceAfterPt}pt`,
      `margin-left:${hwpMarginLeft}pt`,
      `text-indent:-${hanging}pt`,
      `line-height:${linePercent}%`,
      `mso-line-height-alt:${linePercent}%`,
      `text-align:${s.alignment}`,
      "word-break:keep-all",
      "mso-pagination:none",
      "mso-padding-alt:0pt 0pt 0pt 0pt",
      "padding:0"
    ].join(";");
  }

  function hwpTextCss(style){
    const {
      s,
      linePercent
    }=referenceMetrics(style);

    const fontName=
      clean(s.fontFamily) || "HCR Dotum";

    const letterSpacing=
      Number(s.letterSpacingPercent||0)/100;

    return [
      "position:relative",
      `font-size:${s.fontSizePt}pt`,
      `font-family:"${fontName.replace(/["\\]/g,"")}"`,
      `line-height:${linePercent}%`,
      `mso-line-height-alt:${linePercent}%`,
      `letter-spacing:${letterSpacing}em`,
      `mso-font-width:${s.fontScalePercent}%`,
      `mso-fareast-font-family:"${fontName.replace(/["\\]/g,"")}"`,
      `mso-ascii-font-family:"${fontName.replace(/["\\]/g,"")}"`,
      `mso-hansi-font-family:"${fontName.replace(/["\\]/g,"")}"`,
      "mso-text-raise:0pt",
      "font-weight:normal"
    ].join(";");
  }

  function wordParagraphCss(style){
    const {
      s,
      hanging,
      wordParagraphLeft,
      lineHeightPt
    }=referenceMetrics(style);

    // Word에서는 시각적 180%를 확실하게 만들기 위해
    // 10pt 기준 18pt의 Exactly line spacing으로 넘긴다.
    return [
      `margin-top:${s.spaceBeforePt}pt`,
      `margin-right:${s.rightIndentPt}pt`,
      `margin-bottom:${s.spaceAfterPt}pt`,
      `margin-left:${wordParagraphLeft}pt`,
      `mso-margin-top-alt:${s.spaceBeforePt}pt`,
      `mso-margin-bottom-alt:${s.spaceAfterPt}pt`,
      "padding:0",
      `text-indent:-${hanging}pt`,
      `line-height:${lineHeightPt}pt`,
      "mso-line-height-rule:exactly",
      `text-align:${s.alignment}`,
      "mso-pagination:widow-orphan"
    ].join(";");
  }

  function wordTextCss(style){
    const {
      s,
      letterSpacingEm
    }=referenceMetrics(style);

    const family=cssFontFamily(s.fontFamily);

    return [
      `font-family:${family}`,
      `mso-fareast-font-family:${family}`,
      `mso-ascii-font-family:${family}`,
      `mso-hansi-font-family:${family}`,
      `font-size:${s.fontSizePt}pt`,
      `font-stretch:${s.fontScalePercent}%`,
      `letter-spacing:${letterSpacingEm}em`,
      "font-weight:normal"
    ].join(";");
  }

  function normalizeItalicHtml(html){
    const box=document.createElement("div");
    box.innerHTML=html;

    for(const em of box.querySelectorAll("em")){
      const italic=document.createElement("i");
      italic.innerHTML=em.innerHTML;
      em.replaceWith(italic);
    }

    return box.innerHTML;
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
    formatKey,
    style
  ){
    const item=document.createElement("div");
    item.className="reference-output-item";

    const content=document.createElement("div");
    content.className="reference-output-content";
    content.contentEditable="true";
    content.spellcheck=false;
    content.innerHTML=html;
    content.setAttribute(
      "style",
      previewStyleCss(style)
    );

    const plain=plainTextFromHtml(html);

    item.dataset.sheetOrder=String(sheetIndex);
    item.dataset.languageGroup=String(
      languageGroup(paper,plain)
    );
    item.dataset.sortKey=sortKeyFor(paper,plain);
    item.dataset.formatKey=formatKey;
    item.dataset.referenceStyle=JSON.stringify(
      global.ParanPaperData.normalizeReferenceStyle(style)
    );

    item.append(content);
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

      const style=
        global.ParanPaperData.effectiveReferenceStyle(
          group,
          key
        );

      const item=makeReferenceElement(
        paper,
        html,
        index,
        key,
        style
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
        .querySelectorAll(".reference-output-item")
    ]
      .map(item=>
        String(
          item.querySelector(".reference-output-content")?.innerText || ""
        ).trim()
      )
      .filter(Boolean)
      .join("\n");
  }

  function wordOutputHtml(){
    const items=[
      ...$("referenceOutputArea")
        .querySelectorAll(".reference-output-item")
    ];

    const body=items.map(item=>{
      const content=
        item.querySelector(".reference-output-content");

      let style;
      try{
        style=JSON.parse(
          item.dataset.referenceStyle || "{}"
        );
      }catch(_e){
        style={};
      }

      const html=normalizeItalicHtml(
        content?.innerHTML || ""
      );

      return (
        `<p style="${wordParagraphCss(style)}">`+
        `<span style="${wordTextCss(style)}">`+
        html+
        "</span></p>"
      );
    }).join("");

    return (
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" '+
      'xmlns:w="urn:schemas-microsoft-com:office:word">'+
      '<head><meta charset="utf-8"></head>'+
      '<body style="margin:0;padding:0;">'+
      body+
      "</body></html>"
    );
  }

  function copyVisibleOutput(){
    const area=$("referenceOutputArea");
    const items=[
      ...area.querySelectorAll(".reference-output-item")
    ];

    if(!items.length){
      throw new Error(
        "복사할 참고문헌이 없습니다."
      );
    }

    const selection=window.getSelection();
    const savedRanges=[];
    const originalStyles=[];

    try{
      if(selection){
        for(let i=0;i<selection.rangeCount;i++){
          savedRanges.push(
            selection.getRangeAt(i).cloneRange()
          );
        }
      }

      area.classList.add("reference-copy-clean");

      for(const item of items){
        const content=
          item.querySelector(".reference-output-content");

        if(!content)continue;

        originalStyles.push({
          content,
          style:content.getAttribute("style")
        });

        let style;
        try{
          style=JSON.parse(
            item.dataset.referenceStyle || "{}"
          );
        }catch(_e){
          style={};
        }

        content.setAttribute(
          "style",
          [
            wordParagraphCss(style),
            wordTextCss(style)
          ].join(";")
        );
      }

      const range=document.createRange();

      // 맨 앞/뒤 요소의 바깥 경계를 선택하지 않고,
      // 출력 영역 내부만 선택해 첫 빈 문단 발생을 줄인다.
      range.selectNodeContents(area);

      selection.removeAllRanges();
      selection.addRange(range);

      const ok=document.execCommand("copy");

      if(!ok){
        throw new Error(
          "브라우저가 서식 복사를 허용하지 않았습니다."
        );
      }
    }finally{
      for(const entry of originalStyles){
        if(entry.style===null){
          entry.content.removeAttribute("style");
        }else{
          entry.content.setAttribute(
            "style",
            entry.style
          );
        }
      }

      area.classList.remove("reference-copy-clean");

      try{
        selection.removeAllRanges();

        for(const oldRange of savedRanges){
          selection.addRange(oldRange);
        }
      }catch(_e){}
    }
  }

  async function copyWord(){
    const plain=plainOutputText();

    if(!plain){
      setState(
        "복사할 참고문헌이 없습니다.",
        "error"
      );
      return;
    }

    const html=wordOutputHtml();

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

        setState(
          "Word용 복사 완료 · Word에서 Ctrl+V로 붙여 넣으세요.",
          "saved"
        );
        return;
      }

      throw new Error(
        "ClipboardItem을 지원하지 않습니다."
      );
    }catch(error){
      console.warn(
        "Word용 ClipboardItem 복사 실패:",
        error
      );

      try{
        copyVisibleOutput();

        setState(
          "Word용 복사 완료 · Word에서 Ctrl+V로 붙여 넣으세요.",
          "saved"
        );
      }catch(fallbackError){
        console.error(fallbackError);
        setState(
          `Word용 복사 실패: ${fallbackError.message}`,
          "error"
        );
      }
    }
  }

  function hwpOutputHtml(){
    const items=[
      ...$("referenceOutputArea")
        .querySelectorAll(".reference-output-item")
    ];

    const body=items.map(item=>{
      const content=
        item.querySelector(".reference-output-content");

      let style;
      try{
        style=JSON.parse(
          item.dataset.referenceStyle || "{}"
        );
      }catch(_e){
        style={};
      }

      const html=normalizeItalicHtml(
        content?.innerHTML || ""
      );

      // 한컴이 HTML을 내보낼 때 사용하는 구조를 최대한 단순하게 따른다.
      // p와 span 양쪽에 line-height를 넣는 것이 핵심이다.
      return (
        `<p class="HStyle0" style="${hwpParagraphCss(style)}">`+
        `<span style="${hwpTextCss(style)}">`+
        html+
        "</span></p>"
      );
    }).join("");

    return (
      '<html><head><meta charset="utf-8"></head>'+
      '<body style="margin:0;padding:0;">'+
      '<!--StartFragment-->'+
      body+
      '<!--EndFragment-->'+
      "</body></html>"
    );
  }

  function copyHwp(){
    const plain=plainOutputText();

    if(!plain){
      setState(
        "복사할 참고문헌이 없습니다.",
        "error"
      );
      return;
    }

    const html=hwpOutputHtml();
    let handled=false;

    const onCopy=event=>{
      try{
        if(!event.clipboardData)return;

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
          "아래한글용 HTML copy 이벤트 오류:",
          error
        );
      }
    };

    document.addEventListener(
      "copy",
      onCopy,
      {
        capture:true,
        once:true
      }
    );

    try{
      const ok=document.execCommand("copy");

      if(!ok || !handled){
        throw new Error(
          "브라우저가 아래한글용 HTML Format 복사를 처리하지 않았습니다."
        );
      }

      setState(
        "아래한글용 복사 완료 · 반드시 Ctrl+Alt+V → 인터넷 문서로 붙여 넣으세요.",
        "saved"
      );
    }catch(error){
      try{
        document.removeEventListener(
          "copy",
          onCopy,
          true
        );
      }catch(_e){}

      console.error(error);
      setState(
        `아래한글용 복사 실패: ${error.message}`,
        "error"
      );
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
    $("referenceWordCopyBtn").onclick=copyWord;
    $("referenceHwpCopyBtn").onclick=copyHwp;
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
