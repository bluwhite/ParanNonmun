/* 파란 논문 v0.11.0 - 참고문헌 형식(out_set) 관리 */
(function(global){
  "use strict";

  const $=id=>document.getElementById(id);

  let working=[];
  let selectedId=null;
  let saveCallback=async()=>{};
  let dirty=false;
  let initialized=false;

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function current(){
    return working.find(format=>format.id===selectedId) || null;
  }

  function setState(message,kind=""){
    const el=$("formatManagerState");
    if(!el)return;

    el.textContent=message;
    el.className=`format-manager-state ${kind}`.trim();
  }

  function setDirty(value=true){
    dirty=value;

    const saveBtn=$("formatSaveBtn");
    if(saveBtn){
      saveBtn.disabled=!dirty;
    }

    if(dirty){
      setState("저장하지 않은 변경이 있습니다.","warning");
    }
  }

  function uniqueName(base,excludeId=null){
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatName;

    const names=new Set(
      working
        .filter(item=>item.id!==excludeId)
        .map(item=>normalize(item.name))
    );

    let candidate=String(base||"새 형식")
      .normalize("NFKC")
      .trim() || "새 형식";

    if(!names.has(normalize(candidate)))return candidate;

    for(let index=2;index<1000;index++){
      const next=`${candidate} ${index}`;
      if(!names.has(normalize(next)))return next;
    }

    return `${candidate} ${Date.now()}`;
  }

  function newFormatId(){
    if(global.crypto?.randomUUID){
      return `ref-format-${global.crypto.randomUUID()}`;
    }

    return `ref-format-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function commitEditor(){
    const format=current();
    if(!format)return;

    format.name=$("formatNameInput").value
      .normalize("NFKC")
      .trim();

    format.template=$("formatTemplateInput").value
      .replace(/\r\n?/g,"\n")
      .trim();

    format.italicTokens=[
      ...document.querySelectorAll(
        '#formatItalicTokens input[type="checkbox"]:checked'
      )
    ].map(input=>input.value);
  }

  function renderTokenButtons(){
    const host=$("formatTokenButtons");
    const italicHost=$("formatItalicTokens");

    host.replaceChildren();
    italicHost.replaceChildren();

    for(const item of global.ParanPaperData.REFERENCE_FORMAT_TOKENS){
      const button=document.createElement("button");
      button.type="button";
      button.className="format-token-button";
      button.textContent=item.token;
      button.title=`${item.label} 코드 삽입`;

      button.onclick=()=>{
        const textarea=$("formatTemplateInput");
        const start=textarea.selectionStart ?? textarea.value.length;
        const end=textarea.selectionEnd ?? start;
        const before=textarea.value.slice(0,start);
        const after=textarea.value.slice(end);

        textarea.value=
          before+item.token+after;

        const cursor=start+item.token.length;
        textarea.focus();
        textarea.setSelectionRange(cursor,cursor);

        commitEditor();
        setDirty(true);
      };

      host.append(button);

      const label=document.createElement("label");
      label.className="format-italic-item";

      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.value=item.token;

      checkbox.onchange=()=>{
        commitEditor();
        setDirty(true);
      };

      const text=document.createElement("span");
      text.innerHTML=
        `<strong>${item.token}</strong><small>${item.label}</small>`;

      label.append(checkbox,text);
      italicHost.append(label);
    }
  }

  function renderList(){
    const list=$("formatList");
    list.replaceChildren();

    for(const format of working){
      const button=document.createElement("button");
      button.type="button";
      button.className="format-list-item";
      button.classList.toggle("active",format.id===selectedId);

      const name=document.createElement("strong");
      name.textContent=format.name || "(이름 없음)";

      const template=document.createElement("small");
      template.textContent=format.template || "(템플릿 없음)";

      button.append(name,template);

      button.onclick=()=>{
        if(format.id===selectedId)return;

        commitEditor();
        selectedId=format.id;
        renderList();
        renderEditor();
      };

      list.append(button);
    }

    $("formatDeleteBtn").disabled=working.length<=1 || !selectedId;
    $("formatDuplicateBtn").disabled=!selectedId;
  }

  function renderEditor(){
    const format=current();
    const enabled=!!format;

    $("formatNameInput").disabled=!enabled;
    $("formatTemplateInput").disabled=!enabled;

    for(const checkbox of document.querySelectorAll(
      '#formatItalicTokens input[type="checkbox"]'
    )){
      checkbox.disabled=!enabled;
    }

    if(!format){
      $("formatNameInput").value="";
      $("formatTemplateInput").value="";
      return;
    }

    $("formatNameInput").value=format.name;
    $("formatTemplateInput").value=format.template;

    const italicSet=new Set(format.italicTokens||[]);

    for(const checkbox of document.querySelectorAll(
      '#formatItalicTokens input[type="checkbox"]'
    )){
      checkbox.checked=italicSet.has(checkbox.value);
    }
  }

  function validate(){
    commitEditor();

    if(!working.length){
      throw new Error("참고문헌 형식이 하나 이상 필요합니다.");
    }

    const names=new Set();
    const normalize=
      global.ParanPaperData.normalizeReferenceFormatName;

    for(const format of working){
      const name=String(format.name||"").trim();
      const template=String(format.template||"").trim();

      if(!name){
        throw new Error("형식 이름이 비어 있습니다.");
      }

      if(!template){
        throw new Error(`"${name}" 형식의 템플릿이 비어 있습니다.`);
      }

      const key=normalize(name);

      if(names.has(key)){
        throw new Error(`형식 이름이 중복됩니다: ${name}`);
      }

      names.add(key);
    }

    return global.ParanPaperData.normalizeReferenceFormats(
      working
    );
  }

  function addFormat(){
    commitEditor();

    const format={
      id:newFormatId(),
      name:uniqueName("새 형식"),
      template:"AU(PY), TI, JO.",
      italicTokens:[]
    };

    working.push(format);
    selectedId=format.id;
    renderList();
    renderEditor();
    setDirty(true);
    $("formatNameInput").focus();
    $("formatNameInput").select();
  }

  function duplicateFormat(){
    commitEditor();

    const source=current();
    if(!source)return;

    const copy={
      ...clone(source),
      id:newFormatId(),
      name:uniqueName(`${source.name} 복사본`)
    };

    working.push(copy);
    selectedId=copy.id;
    renderList();
    renderEditor();
    setDirty(true);
  }

  function deleteFormat(){
    if(working.length<=1){
      setState(
        "참고문헌 형식은 하나 이상 남겨야 합니다.",
        "error"
      );
      return;
    }

    const format=current();
    if(!format)return;

    if(!confirm(`"${format.name}" 형식을 삭제할까요?`)){
      return;
    }

    const index=working.findIndex(
      item=>item.id===selectedId
    );

    working=working.filter(
      item=>item.id!==selectedId
    );

    const nextIndex=Math.min(
      Math.max(index,0),
      working.length-1
    );

    selectedId=working[nextIndex]?.id || working[0]?.id || null;

    renderList();
    renderEditor();
    setDirty(true);
  }

  async function save(){
    const button=$("formatSaveBtn");

    try{
      button.disabled=true;
      setState("참고문헌 형식을 저장 중...","saving");

      const normalized=validate();
      await saveCallback(clone(normalized));

      working=clone(normalized);
      selectedId=
        working.find(item=>item.id===selectedId)?.id ||
        working[0]?.id ||
        null;

      dirty=false;
      renderList();
      renderEditor();
      setState(
        `저장됨 · 형식 ${working.length}개`,
        "saved"
      );
    }catch(error){
      console.error(error);
      setState(
        `저장 실패: ${error.message}`,
        "error"
      );
    }finally{
      button.disabled=!dirty;
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

  function bind(){
    if(initialized)return;
    initialized=true;

    renderTokenButtons();

    $("formatNewBtn").onclick=addFormat;
    $("formatDuplicateBtn").onclick=duplicateFormat;
    $("formatDeleteBtn").onclick=deleteFormat;
    $("formatSaveBtn").onclick=save;
    $("formatCloseBtn").onclick=close;
    $("formatCloseIconBtn").onclick=close;

    $("formatNameInput").addEventListener("input",()=>{
      commitEditor();
      renderList();
      setDirty(true);
    });

    $("formatTemplateInput").addEventListener("input",()=>{
      commitEditor();
      renderList();
      setDirty(true);
    });

    $("formatManagerDialog").addEventListener("click",event=>{
      if(event.target===$("formatManagerDialog")){
        close();
      }
    });

    $("formatManagerDialog").addEventListener("cancel",event=>{
      event.preventDefault();
      close();
    });
  }

  function open(options={}){
    bind();

    working=clone(
      global.ParanPaperData.normalizeReferenceFormats(
        options.formats
      )
    );

    if(!working.length){
      working=
        global.ParanPaperData.cloneDefaultReferenceFormats();
    }

    saveCallback=
      typeof options.onSave==="function"
        ? options.onSave
        : async()=>{};

    selectedId=
      options.selectedId &&
      working.some(item=>item.id===options.selectedId)
        ? options.selectedId
        : working[0]?.id || null;

    dirty=false;
    renderList();
    renderEditor();
    setDirty(false);

    setState(
      `형식 ${working.length}개 · 템플릿과 이탤릭 항목을 수정할 수 있습니다.`
    );

    $("formatManagerDialog").showModal();
  }

  global.ParanReferenceFormatManager=Object.freeze({
    open
  });
})(window);
