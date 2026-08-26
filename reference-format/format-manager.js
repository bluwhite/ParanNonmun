/* 파란 논문 v0.13.0 - 참고문헌 양식 + 글자/문단 모양 관리 */
(function(global){
  "use strict";

  const $=id=>document.getElementById(id);

  const GROUP_STYLE_IDS={
    fontFamily:"formatGroupFontFamily",
    fontSizePt:"formatGroupFontSize",
    lineHeightPercent:"formatGroupLineHeight",
    leftIndentPt:"formatGroupLeftIndent",
    hangingIndentPt:"formatGroupHangingIndent",
    spaceBeforePt:"formatGroupSpaceBefore",
    spaceAfterPt:"formatGroupSpaceAfter",
    alignment:"formatGroupAlignment"
  };

  const STYLE_FIELDS=[
    {key:"fontFamily",label:"글꼴",type:"text",list:"referenceFontList"},
    {key:"fontSizePt",label:"크기",unit:"pt",type:"number",min:5,max:72,step:0.5},
    {key:"lineHeightPercent",label:"줄간격",unit:"%",type:"number",min:80,max:400,step:5},
    {key:"leftIndentPt",label:"왼쪽 여백",unit:"pt",type:"number",min:0,max:300,step:1},
    {key:"hangingIndentPt",label:"내어쓰기",unit:"pt",type:"number",min:0,max:300,step:1},
    {key:"spaceBeforePt",label:"문단 위",unit:"pt",type:"number",min:0,max:200,step:1},
    {key:"spaceAfterPt",label:"문단 아래",unit:"pt",type:"number",min:0,max:200,step:1},
    {key:"alignment",label:"정렬",type:"select"}
  ];

  let working=[];
  let selectedId=null;
  let saveCallback=async()=>{};
  let initialized=false;
  let dirty=false;

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function currentGroup(){
    return working.find(group=>group.id===selectedId) || null;
  }

  function setState(message,kind=""){
    const el=$("formatManagerState");
    if(!el)return;
    el.textContent=message;
    el.className=`format-manager-state ${kind}`.trim();
  }

  function setDirty(value=true){
    dirty=value;
    $("formatSaveBtn").disabled=!dirty;
    if(dirty)setState("저장하지 않은 변경이 있습니다.","warning");
  }

  function escapeHtml(text){
    return String(text??"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function nodeToSafeHtml(node,inheritedItalic=false){
    if(node.nodeType===Node.TEXT_NODE){
      return escapeHtml(
        String(node.nodeValue||"")
          .replace(/\u00a0/g," ")
          .replace(/\r?\n/g," ")
      );
    }

    if(node.nodeType!==Node.ELEMENT_NODE)return "";

    const element=node;
    const tag=element.tagName.toLowerCase();
    if(tag==="br")return " ";

    const style=String(element.getAttribute("style")||"").toLowerCase();
    const isItalic=
      inheritedItalic ||
      tag==="i" ||
      tag==="em" ||
      /font-style\s*:\s*italic/.test(style);

    let inner="";
    for(const child of element.childNodes){
      inner+=nodeToSafeHtml(child,isItalic);
    }

    if(!inner)return "";
    if(isItalic && !inheritedItalic)return `<em>${inner}</em>`;

    const blockTags=new Set([
      "div","p","section","article","li","ul","ol",
      "h1","h2","h3","h4","h5","h6"
    ]);

    return blockTags.has(tag) ? ` ${inner} ` : inner;
  }

  function sanitizeEditorHtml(editor){
    let html="";
    for(const node of editor.childNodes){
      html+=nodeToSafeHtml(node,false);
    }
    return global.ParanPaperData.sanitizeTemplateHtml(html);
  }

  function sanitizeClipboardHtml(html){
    const box=document.createElement("div");
    box.innerHTML=html;
    let result="";
    for(const node of box.childNodes){
      result+=nodeToSafeHtml(node,false);
    }
    return global.ParanPaperData.sanitizeTemplateHtml(result);
  }

  function selectedGroupNameSet(excludeId=null){
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatGroupName;
    return new Set(
      working
        .filter(group=>group.id!==excludeId)
        .map(group=>normalize(group.name))
    );
  }

  function uniqueGroupName(base,excludeId=null){
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatGroupName;
    const names=selectedGroupNameSet(excludeId);
    const clean=String(base||"새 양식").normalize("NFKC").trim() || "새 양식";

    if(!names.has(normalize(clean)))return clean;

    for(let index=2;index<1000;index++){
      const candidate=`${clean} ${index}`;
      if(!names.has(normalize(candidate)))return candidate;
    }
    return `${clean} ${Date.now()}`;
  }

  function newGroupId(){
    if(global.crypto?.randomUUID){
      return `ref-group-${global.crypto.randomUUID()}`;
    }
    return `ref-group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createStyleControl(field){
    const label=document.createElement("label");
    label.className="reference-style-mini-field";

    const title=document.createElement("span");
    title.textContent=field.unit
      ? `${field.label}(${field.unit})`
      : field.label;

    let control;

    if(field.type==="select"){
      control=document.createElement("select");
      for(const [value,text] of [
        ["left","왼쪽"],
        ["justify","양쪽"],
        ["center","가운데"],
        ["right","오른쪽"]
      ]){
        const option=document.createElement("option");
        option.value=value;
        option.textContent=text;
        control.append(option);
      }
    }else{
      control=document.createElement("input");
      control.type=field.type;
      if(field.list)control.setAttribute("list",field.list);
      if(field.min!==undefined)control.min=String(field.min);
      if(field.max!==undefined)control.max=String(field.max);
      if(field.step!==undefined)control.step=String(field.step);
      control.autocomplete="off";
    }

    control.className="reference-style-control";
    control.dataset.styleField=field.key;

    label.append(title,control);
    return label;
  }

  function ensureFormatStyleControls(){
    for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
      const editor=document.querySelector(
        `[data-format-key="${item.key}"]`
      );
      const row=editor?.closest(".format-template-row");
      if(!row || row.dataset.styleReady==="1")continue;

      row.dataset.styleReady="1";
      row.dataset.formatKey=item.key;

      const toggle=document.createElement("label");
      toggle.className="format-override-toggle";

      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.dataset.formatOverride=item.key;

      const text=document.createElement("span");
      text.textContent="개별 서식";

      toggle.append(checkbox,text);

      const panel=document.createElement("div");
      panel.className="format-style-override";
      panel.dataset.formatStyleKey=item.key;

      for(const field of STYLE_FIELDS){
        panel.append(createStyleControl(field));
      }

      row.append(toggle,panel);

      checkbox.addEventListener("change",()=>{
        updateOverridePanelState(item.key);
        commitEditor();
        setDirty(true);
      });

      for(const control of panel.querySelectorAll(".reference-style-control")){
        control.addEventListener("input",()=>{
          commitEditor();
          setDirty(true);
        });
        control.addEventListener("change",()=>{
          commitEditor();
          setDirty(true);
        });
      }
    }
  }

  function readStyleControls(container){
    const raw={};
    for(const field of STYLE_FIELDS){
      const control=container.querySelector(
        `[data-style-field="${field.key}"]`
      );
      if(!control)continue;
      raw[field.key]=
        field.type==="number"
          ? Number(control.value)
          : control.value;
    }
    return global.ParanPaperData.normalizeReferenceStyle(raw);
  }

  function writeStyleControls(container,style){
    const normalized=
      global.ParanPaperData.normalizeReferenceStyle(style);

    for(const field of STYLE_FIELDS){
      const control=container.querySelector(
        `[data-style-field="${field.key}"]`
      );
      if(control)control.value=String(normalized[field.key]);
    }
  }

  function readGroupStyle(){
    const raw={};
    for(const [key,id] of Object.entries(GROUP_STYLE_IDS)){
      const control=$(id);
      raw[key]=
        control?.type==="number"
          ? Number(control.value)
          : control?.value;
    }
    return global.ParanPaperData.normalizeReferenceStyle(raw);
  }

  function writeGroupStyle(style){
    const normalized=
      global.ParanPaperData.normalizeReferenceStyle(style);

    for(const [key,id] of Object.entries(GROUP_STYLE_IDS)){
      const control=$(id);
      if(control)control.value=String(normalized[key]);
    }
  }

  function updateOverridePanelState(key){
    const checkbox=document.querySelector(
      `[data-format-override="${key}"]`
    );
    const panel=document.querySelector(
      `[data-format-style-key="${key}"]`
    );
    if(!checkbox || !panel)return;

    const enabled=checkbox.checked;
    panel.hidden=!enabled;
    for(const control of panel.querySelectorAll(".reference-style-control")){
      control.disabled=!enabled;
    }
  }

  function commitEditor(){
    const group=currentGroup();
    if(!group)return;

    group.name=$("formatGroupNameInput").value.normalize("NFKC").trim();
    group.style=readGroupStyle();
    group.formats=group.formats || {};
    group.formatStyles=group.formatStyles || {};

    for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
      const editor=document.querySelector(
        `[data-format-key="${item.key}"]`
      );
      const checkbox=document.querySelector(
        `[data-format-override="${item.key}"]`
      );
      const panel=document.querySelector(
        `[data-format-style-key="${item.key}"]`
      );

      group.formats[item.key]=sanitizeEditorHtml(editor);
      group.formatStyles[item.key]={
        useGroupStyle:!checkbox?.checked,
        style:readStyleControls(panel)
      };
    }
  }

  function renderGroupList(){
    const list=$("formatGroupList");
    list.replaceChildren();

    for(const group of working){
      const button=document.createElement("button");
      button.type="button";
      button.className="format-list-item";
      button.classList.toggle("active",group.id===selectedId);

      const name=document.createElement("strong");
      name.textContent=group.name || "(이름 없음)";

      const detail=document.createElement("small");
      detail.textContent="6개 형식 · 글자/문단 서식";

      button.append(name,detail);

      button.onclick=()=>{
        if(group.id===selectedId)return;
        commitEditor();
        selectedId=group.id;
        renderGroupList();
        renderEditor();
      };

      list.append(button);
    }

    $("formatGroupDeleteBtn").disabled=working.length<=1 || !selectedId;
    $("formatGroupDuplicateBtn").disabled=!selectedId;
  }

  function renderEditor(){
    const group=currentGroup();
    const enabled=!!group;

    $("formatGroupNameInput").disabled=!enabled;
    $("formatGroupNameInput").value=group?.name || "";

    for(const id of Object.values(GROUP_STYLE_IDS)){
      $(id).disabled=!enabled;
    }

    if(group)writeGroupStyle(group.style);

    for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
      const editor=document.querySelector(
        `[data-format-key="${item.key}"]`
      );
      const checkbox=document.querySelector(
        `[data-format-override="${item.key}"]`
      );
      const panel=document.querySelector(
        `[data-format-style-key="${item.key}"]`
      );

      editor.contentEditable=enabled ? "true" : "false";
      editor.innerHTML=group?.formats?.[item.key] || "";

      const entry=group?.formatStyles?.[item.key] || {
        useGroupStyle:true,
        style:group?.style
      };

      checkbox.disabled=!enabled;
      checkbox.checked=entry.useGroupStyle===false;
      writeStyleControls(panel,entry.style || group?.style);
      updateOverridePanelState(item.key);
    }
  }

  function createBaseGroup(){
    const base=
      global.ParanPaperData.cloneDefaultReferenceFormatGroups()[0];

    return {
      ...clone(base),
      id:newGroupId(),
      name:uniqueGroupName("새 양식")
    };
  }

  function addGroup(){
    commitEditor();
    const group=createBaseGroup();
    working.push(group);
    selectedId=group.id;
    renderGroupList();
    renderEditor();
    setDirty(true);
    $("formatGroupNameInput").focus();
    $("formatGroupNameInput").select();
  }

  function duplicateGroup(){
    commitEditor();
    const source=currentGroup();
    if(!source)return;

    const copy={
      ...clone(source),
      id:newGroupId(),
      name:uniqueGroupName(`${source.name} 복사본`)
    };

    working.push(copy);
    selectedId=copy.id;
    renderGroupList();
    renderEditor();
    setDirty(true);
  }

  function deleteGroup(){
    if(working.length<=1){
      setState("참고문헌 양식 그룹은 하나 이상 남겨야 합니다.","error");
      return;
    }

    const group=currentGroup();
    if(!group)return;

    if(!confirm(`"${group.name}" 양식 그룹을 삭제할까요?`))return;

    const index=working.findIndex(item=>item.id===selectedId);
    working=working.filter(item=>item.id!==selectedId);

    selectedId=
      working[Math.min(index,working.length-1)]?.id ||
      working[0]?.id ||
      null;

    renderGroupList();
    renderEditor();
    setDirty(true);
  }

  function validate(){
    commitEditor();

    if(!working.length){
      throw new Error("참고문헌 양식 그룹이 하나 이상 필요합니다.");
    }

    const names=new Set();
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatGroupName;

    for(const group of working){
      const name=String(group.name||"").trim();
      if(!name)throw new Error("양식 그룹 이름이 비어 있습니다.");

      const nameKey=normalize(name);
      if(names.has(nameKey)){
        throw new Error(`양식 그룹 이름이 중복됩니다: ${name}`);
      }
      names.add(nameKey);

      for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
        const html=group.formats?.[item.key] || "";
        if(!global.ParanPaperData.templateText(html)){
          throw new Error(`"${name}"의 ${item.label} 템플릿이 비어 있습니다.`);
        }
      }
    }

    return global.ParanPaperData.normalizeReferenceFormatGroups(working);
  }

  async function save(){
    try{
      $("formatSaveBtn").disabled=true;
      setState("참고문헌 양식을 저장 중...","saving");

      const normalized=validate();
      await saveCallback(clone(normalized));

      working=clone(normalized);
      selectedId=
        working.find(group=>group.id===selectedId)?.id ||
        working[0]?.id ||
        null;

      dirty=false;
      renderGroupList();
      renderEditor();
      setState(`저장됨 · 양식 그룹 ${working.length}개`,"saved");
    }catch(error){
      console.error(error);
      setState(`저장 실패: ${error.message}`,"error");
    }finally{
      $("formatSaveBtn").disabled=!dirty;
    }
  }

  function close(){
    if(
      dirty &&
      !confirm("저장하지 않은 변경이 있습니다. 그대로 닫을까요?")
    ){
      return;
    }
    $("formatManagerDialog").close();
  }

  function handleTemplateKeydown(event){
    if(event.key==="Enter"){
      event.preventDefault();
      return;
    }

    if(
      event.key.toLowerCase()==="i" &&
      (event.ctrlKey || event.metaKey)
    ){
      event.preventDefault();
      document.execCommand("italic",false,null);
      commitEditor();
      setDirty(true);
    }
  }

  function handleTemplatePaste(event){
    event.preventDefault();

    const clipboard=event.clipboardData;
    const sourceHtml=clipboard?.getData("text/html") || "";
    const sourceText=clipboard?.getData("text/plain") || "";

    if(sourceHtml){
      document.execCommand(
        "insertHTML",
        false,
        sanitizeClipboardHtml(sourceHtml)
      );
    }else{
      document.execCommand(
        "insertText",
        false,
        sourceText.replace(/\r?\n/g," ")
      );
    }

    commitEditor();
    setDirty(true);
  }

  function renderCodeHelp(){
    const host=$("formatCodeHelp");
    host.replaceChildren();

    for(const item of global.ParanPaperData.REFERENCE_TEMPLATE_CODES){
      const row=document.createElement("div");
      row.className="format-code-help-item";

      const code=document.createElement("code");
      code.textContent=item.code;

      const label=document.createElement("span");
      label.textContent=item.label;

      row.append(code,label);
      host.append(row);
    }
  }

  function bind(){
    if(initialized)return;
    initialized=true;

    ensureFormatStyleControls();
    renderCodeHelp();

    $("formatGroupNewBtn").onclick=addGroup;
    $("formatGroupDuplicateBtn").onclick=duplicateGroup;
    $("formatGroupDeleteBtn").onclick=deleteGroup;
    $("formatSaveBtn").onclick=save;
    $("formatCloseBtn").onclick=close;
    $("formatCloseIconBtn").onclick=close;

    $("formatGroupNameInput").addEventListener("input",()=>{
      commitEditor();
      renderGroupList();
      setDirty(true);
    });

    for(const id of Object.values(GROUP_STYLE_IDS)){
      const control=$(id);
      control.addEventListener("input",()=>{
        commitEditor();
        setDirty(true);
      });
      control.addEventListener("change",()=>{
        commitEditor();
        setDirty(true);
      });
    }

    for(const editor of document.querySelectorAll(".format-template-editor")){
      editor.addEventListener("input",()=>{
        commitEditor();
        setDirty(true);
      });
      editor.addEventListener("keydown",handleTemplateKeydown);
      editor.addEventListener("paste",handleTemplatePaste);
    }

    $("formatManagerDialog").addEventListener("cancel",event=>{
      event.preventDefault();
      close();
    });
  }

  function open(options={}){
    bind();

    working=clone(
      global.ParanPaperData.normalizeReferenceFormatGroups(options.groups)
    );

    saveCallback=
      typeof options.onSave==="function"
        ? options.onSave
        : async()=>{};

    selectedId=
      options.selectedId &&
      working.some(group=>group.id===options.selectedId)
        ? options.selectedId
        : working[0]?.id || null;

    dirty=false;
    renderGroupList();
    renderEditor();
    setDirty(false);

    setState(
      `양식 그룹 ${working.length}개 · 공통 서식 또는 형식별 개별 서식을 지정할 수 있습니다.`
    );

    $("formatManagerDialog").showModal();
  }

  global.ParanReferenceFormatManager=Object.freeze({open});
})(window);
