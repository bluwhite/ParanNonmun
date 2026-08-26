/* 파란 논문 v0.13.1 - 참고문헌 양식 관리 */
(function(global){
  "use strict";

  const $=id=>document.getElementById(id);

  const STYLE_CONTROL_IDS={
    fontFamily:"formatStyleFontFamily",
    fontSizePt:"formatStyleFontSize",
    fontScalePercent:"formatStyleFontScale",
    letterSpacingPercent:"formatStyleLetterSpacing",
    lineHeightPercent:"formatStyleLineHeight",
    leftIndentPt:"formatStyleLeftIndent",
    rightIndentPt:"formatStyleRightIndent",
    hangingIndentPt:"formatStyleHangingIndent",
    spaceBeforePt:"formatStyleSpaceBefore",
    spaceAfterPt:"formatStyleSpaceAfter",
    alignment:"formatStyleAlignment"
  };

  let working=[];
  let selectedId=null;
  let selectedStyleTarget="group";
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
    const italic=
      inheritedItalic ||
      tag==="i" ||
      tag==="em" ||
      /font-style\s*:\s*italic/.test(style);

    let inner="";
    for(const child of element.childNodes){
      inner+=nodeToSafeHtml(child,italic);
    }

    if(!inner)return "";
    if(italic && !inheritedItalic)return `<em>${inner}</em>`;

    return new Set([
      "div","p","section","article","li","ul","ol",
      "h1","h2","h3","h4","h5","h6"
    ]).has(tag)
      ? ` ${inner} `
      : inner;
  }

  function sanitizeEditorHtml(editor){
    if(!editor)return "";
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

  function uniqueGroupName(base){
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatGroupName;
    const names=new Set(working.map(group=>normalize(group.name)));
    const clean=String(base||"새 양식").normalize("NFKC").trim() || "새 양식";

    if(!names.has(normalize(clean)))return clean;

    for(let i=2;i<1000;i++){
      const candidate=`${clean} ${i}`;
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

  function readStyleFields(){
    const raw={};

    for(const [key,id] of Object.entries(STYLE_CONTROL_IDS)){
      const control=$(id);
      raw[key]=
        control?.type==="number"
          ? Number(control.value)
          : control?.value;
    }

    return global.ParanPaperData.normalizeReferenceStyle(raw);
  }

  function writeStyleFields(style){
    const normalized=
      global.ParanPaperData.normalizeReferenceStyle(style);

    for(const [key,id] of Object.entries(STYLE_CONTROL_IDS)){
      const control=$(id);
      if(control)control.value=String(normalized[key]);
    }
  }

  function setStyleFieldsDisabled(disabled){
    for(const id of Object.values(STYLE_CONTROL_IDS)){
      const control=$(id);
      if(control)control.disabled=disabled;
    }
  }

  function ensureGroupShape(group){
    if(!group)return null;

    group.style=
      global.ParanPaperData.normalizeReferenceStyle(group.style);

    group.formatStyles=
      global.ParanPaperData.normalizeFormatStyles(
        group.formatStyles,
        group.style
      );

    group.formats=group.formats || {};
    return group;
  }

  function formatEntry(group,key){
    ensureGroupShape(group);
    return group.formatStyles[key];
  }

  function commitStylePanel(target=selectedStyleTarget){
    const group=ensureGroupShape(currentGroup());
    if(!group)return;

    if(target==="group"){
      group.style=readStyleFields();
      return;
    }

    const entry=formatEntry(group,target);
    const useGroup=$("formatStyleUseGroup").checked;

    entry.useGroupStyle=useGroup;

    if(!useGroup){
      entry.style=readStyleFields();
    }
  }

  function renderStylePanel(){
    const group=ensureGroupShape(currentGroup());
    const enabled=!!group;

    $("formatStyleTargetSelect").disabled=!enabled;
    $("formatStyleTargetSelect").value=selectedStyleTarget;

    if(!enabled){
      $("formatStyleUseGroupRow").hidden=true;
      $("formatStyleInheritedNotice").hidden=true;
      setStyleFieldsDisabled(true);
      return;
    }

    if(selectedStyleTarget==="group"){
      $("formatStyleUseGroupRow").hidden=true;
      $("formatStyleInheritedNotice").hidden=true;
      writeStyleFields(group.style);
      setStyleFieldsDisabled(false);
      return;
    }

    const entry=formatEntry(group,selectedStyleTarget);
    const useGroup=entry.useGroupStyle!==false;

    $("formatStyleUseGroupRow").hidden=false;
    $("formatStyleUseGroup").checked=useGroup;
    $("formatStyleInheritedNotice").hidden=!useGroup;

    if(useGroup){
      writeStyleFields(group.style);
      setStyleFieldsDisabled(true);
    }else{
      writeStyleFields(entry.style);
      setStyleFieldsDisabled(false);
    }
  }

  function commitEditor(){
    const group=ensureGroupShape(currentGroup());
    if(!group)return;

    commitStylePanel(selectedStyleTarget);

    group.name=
      String($("formatGroupNameInput").value||"")
        .normalize("NFKC")
        .trim();

    for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
      const editor=document.querySelector(
        `[data-format-key="${item.key}"]`
      );
      if(editor){
        group.formats[item.key]=sanitizeEditorHtml(editor);
      }
    }
  }

  function renderGroupList(){
    const host=$("formatGroupList");
    host.replaceChildren();

    for(const group of working){
      const button=document.createElement("button");
      button.type="button";
      button.className="format-list-item";
      button.classList.toggle("active",group.id===selectedId);

      const name=document.createElement("strong");
      name.textContent=group.name || "(이름 없음)";

      const detail=document.createElement("small");
      detail.textContent="6개 참고문헌 형식";

      button.append(name,detail);
      button.onclick=()=>{
        if(group.id===selectedId)return;

        commitEditor();
        selectedId=group.id;
        selectedStyleTarget="group";

        renderGroupList();
        renderEditor();
      };

      host.append(button);
    }

    $("formatGroupDeleteBtn").disabled=working.length<=1 || !selectedId;
    $("formatGroupDuplicateBtn").disabled=!selectedId;
  }

  function renderEditor(){
    const group=ensureGroupShape(currentGroup());
    const enabled=!!group;

    $("formatGroupNameInput").disabled=!enabled;
    $("formatGroupNameInput").value=group?.name || "";

    for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
      const editor=document.querySelector(
        `[data-format-key="${item.key}"]`
      );
      if(!editor)continue;

      editor.contentEditable=enabled ? "true" : "false";
      editor.innerHTML=group?.formats?.[item.key] || "";
    }

    renderStylePanel();
  }

  function addGroup(){
    commitEditor();

    const base=
      global.ParanPaperData.cloneDefaultReferenceFormatGroups()[0];

    const group={
      ...clone(base),
      id:newGroupId(),
      name:uniqueGroupName("새 양식")
    };

    working.push(group);
    selectedId=group.id;
    selectedStyleTarget="group";

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
    selectedStyleTarget="group";

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

    selectedStyleTarget="group";

    renderGroupList();
    renderEditor();
    setDirty(true);
  }

  function validate(){
    commitEditor();

    if(!working.length){
      throw new Error("참고문헌 양식 그룹이 하나 이상 필요합니다.");
    }

    const normalizeName=
      global.ParanPaperData.normalizeReferenceFormatGroupName;
    const names=new Set();

    const normalized=
      global.ParanPaperData.normalizeReferenceFormatGroups(working);

    for(const group of normalized){
      const name=String(group.name||"").trim();
      if(!name)throw new Error("양식 그룹 이름이 비어 있습니다.");

      const key=normalizeName(name);
      if(names.has(key)){
        throw new Error(`양식 그룹 이름이 중복됩니다: ${name}`);
      }
      names.add(key);

      for(const item of global.ParanPaperData.REFERENCE_FORMAT_ITEMS){
        if(!global.ParanPaperData.templateText(group.formats?.[item.key])){
          throw new Error(`"${name}"의 ${item.label} 템플릿이 비어 있습니다.`);
        }
      }
    }

    return normalized;
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

    const html=event.clipboardData?.getData("text/html") || "";
    const plain=event.clipboardData?.getData("text/plain") || "";

    if(html){
      document.execCommand(
        "insertHTML",
        false,
        sanitizeClipboardHtml(html)
      );
    }else{
      document.execCommand(
        "insertText",
        false,
        plain.replace(/\r?\n/g," ")
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

    renderCodeHelp();

    $("formatGroupNewBtn").onclick=addGroup;
    $("formatGroupDuplicateBtn").onclick=duplicateGroup;
    $("formatGroupDeleteBtn").onclick=deleteGroup;
    $("formatSaveBtn").onclick=save;
    $("formatCloseBtn").onclick=close;
    $("formatCloseIconBtn").onclick=close;

    $("formatGroupNameInput").addEventListener("input",()=>{
      const group=currentGroup();
      if(group){
        group.name=
          String($("formatGroupNameInput").value||"")
            .normalize("NFKC")
            .trim();
      }
      renderGroupList();
      setDirty(true);
    });

    for(const editor of document.querySelectorAll(".format-template-editor")){
      editor.addEventListener("input",()=>{
        commitEditor();
        setDirty(true);
      });
      editor.addEventListener("keydown",handleTemplateKeydown);
      editor.addEventListener("paste",handleTemplatePaste);
    }

    $("formatStyleTargetSelect").addEventListener("change",event=>{
      commitStylePanel(selectedStyleTarget);
      selectedStyleTarget=String(event.target.value||"group");
      renderStylePanel();
    });

    $("formatStyleUseGroup").addEventListener("change",()=>{
      const group=ensureGroupShape(currentGroup());
      if(!group || selectedStyleTarget==="group")return;

      const entry=formatEntry(group,selectedStyleTarget);
      entry.useGroupStyle=$("formatStyleUseGroup").checked;

      renderStylePanel();
      setDirty(true);
    });

    for(const id of Object.values(STYLE_CONTROL_IDS)){
      const control=$(id);
      control.addEventListener("input",()=>{
        commitStylePanel(selectedStyleTarget);
        setDirty(true);
      });
      control.addEventListener("change",()=>{
        commitStylePanel(selectedStyleTarget);
        setDirty(true);
      });
    }

    $("formatManagerDialog").addEventListener("cancel",event=>{
      event.preventDefault();
      close();
    });
  }

  function open(options={}){
    bind();

    working=clone(
      global.ParanPaperData.normalizeReferenceFormatGroups(
        options.groups
      )
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

    selectedStyleTarget="group";
    dirty=false;

    renderGroupList();
    renderEditor();
    setDirty(false);

    setState(
      `양식 그룹 ${working.length}개 · 템플릿 아래에서 글자·문단 스타일을 설정합니다.`
    );

    $("formatManagerDialog").showModal();
  }

  global.ParanReferenceFormatManager=Object.freeze({open});
})(window);
