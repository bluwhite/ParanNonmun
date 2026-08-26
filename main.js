let rootHandle=null,pdfs=[];
const $=id=>document.getElementById(id),status=$('status'),body=$('pdfBody'),count=$('countText');
$('versionBadge').textContent=`v${APP_VERSION}`;
document.title=`논문 PDF 관리 · v${APP_VERSION}`;

const fmt=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';

async function walk(dir,prefix=''){
  const out=[];
  for await(const [name,h] of dir.entries()){
    const path=prefix?`${prefix}/${name}`:name;
    if(h.kind==='directory'){
      out.push(...await walk(h,path));
    }else if(h.kind==='file'&&name.toLowerCase().endsWith('.pdf')){
      const f=await h.getFile();
      out.push({name,path,size:f.size,handle:h});
    }
  }
  return out;
}

function setFolderReady(ready){
  $('scanBtn').disabled=!ready;
  $('noteSearchBtn').disabled=!ready;
}

async function scan(prompt=true){
  if(!rootHandle)return;
  if(!await ensurePermission(rootHandle,'readwrite',prompt)){
    status.textContent='폴더 읽기/쓰기 권한이 필요합니다.';
    setFolderReady(false);
    return;
  }

  status.textContent=`"${rootHandle.name}" 검색 중...`;
  pdfs=await walk(rootHandle);
  pdfs.sort((a,b)=>a.path.localeCompare(b.path,'ko'));
  setFolderReady(true);
  render();
  status.textContent=`PDF ${pdfs.length}개를 찾았습니다.`;
}

function openPdf(path,page=null){
  const u=new URL('./pdf-editor/index.html',location.href);
  u.searchParams.set('file',path);
  if(page)u.searchParams.set('page',page);
  window.open(u.toString(),'_blank');
}

function render(){
  const q=$('searchBox').value.trim().toLowerCase();
  const arr=pdfs.filter(x=>x.name.toLowerCase().includes(q)||x.path.toLowerCase().includes(q));
  count.textContent=`PDF ${arr.length}개`;
  body.replaceChildren();

  if(!arr.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=4;td.className='empty';td.textContent='PDF가 없습니다.';
    tr.append(td);body.append(tr);return;
  }

  for(const x of arr){
    const tr=document.createElement('tr'),
      a=document.createElement('td'),
      b=document.createElement('td'),
      c=document.createElement('td'),
      d=document.createElement('td'),
      btn=document.createElement('button');

    a.textContent=x.name;
    b.textContent=x.path;b.className='path';
    c.textContent=fmt(x.size);
    btn.className='open-btn';btn.textContent='PDF 열기';
    btn.onclick=()=>openPdf(x.path);
    d.append(btn);
    tr.append(a,b,c,d);
    body.append(tr);
  }
}

function renderNoteResults(results){
  const noteBody=$('noteBody');
  noteBody.replaceChildren();

  if(!results.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=3;td.className='empty';td.textContent='일치하는 메모가 없습니다.';
    tr.append(td);noteBody.append(tr);return;
  }

  for(const note of results){
    const tr=document.createElement('tr');
    const fileTd=document.createElement('td');
    const pageTd=document.createElement('td');
    const textTd=document.createElement('td');

    const fileBtn=document.createElement('button');
    fileBtn.className='note-file';
    fileBtn.textContent=note.name;
    fileBtn.title=note.path;
    fileBtn.onclick=()=>openPdf(note.path,note.page);

    fileTd.append(fileBtn);
    pageTd.textContent=note.page;
    pageTd.className='note-page';
    textTd.textContent=note.text;
    textTd.className='note-text';

    tr.append(fileTd,pageTd,textTd);
    noteBody.append(tr);
  }
}

async function searchPdfNotes(){
  if(!rootHandle)return;

  const button=$('noteSearchBtn');
  const progress=$('noteSearchStatus');
  const resultCount=$('noteResultCount');
  const query=$('noteQuery').value.trim();

  try{
    button.disabled=true;
    progress.classList.remove('search-error');

    if(!await ensurePermission(rootHandle,'read',true)){
      throw new Error('폴더 읽기 권한이 필요합니다.');
    }

    if(!pdfs.length){
      progress.textContent='PDF 목록을 확인하는 중...';
      pdfs=await walk(rootHandle);
      pdfs.sort((a,b)=>a.path.localeCompare(b.path,'ko'));
      render();
    }

    resultCount.textContent='검색 중...';

    const {results,errors}=await PdfNoteSearch.search(
      pdfs,
      query,
      ({current,total,found,item})=>{
        progress.textContent=
          `PDF ${current}/${total} 확인 중 · 현재 메모 ${found}개 발견 · ${item.name}`;
      }
    );

    renderNoteResults(results);
    resultCount.textContent=`메모 ${results.length}개`;

    progress.textContent=query
      ? `"${query}" 검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`
      : `검색 완료 · PDF ${pdfs.length}개 확인 · 메모 ${results.length}개`;

    if(errors.length){
      progress.textContent+=` · 읽지 못한 PDF ${errors.length}개`;
      progress.classList.add('search-error');
    }
  }catch(e){
    console.error(e);
    progress.textContent=`메모 검색 실패: ${e.message}`;
    progress.classList.add('search-error');
    alert(`메모 검색 실패: ${e.message}`);
  }finally{
    button.disabled=false;
  }
}

$('searchBox').oninput=render;
$('noteSearchBtn').onclick=searchPdfNotes;
$('noteQuery').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!$('noteSearchBtn').disabled)searchPdfNotes();
});

$('chooseBtn').onclick=async()=>{
  try{
    rootHandle=await showDirectoryPicker({id:'paper-library-root',mode:'readwrite'});
    await saveRootHandle(rootHandle);
    await scan(true);
  }catch(e){
    if(e.name!=='AbortError')alert(e.message);
  }
};

$('reopenBtn').onclick=async()=>{
  rootHandle=await loadRootHandle();
  if(!rootHandle)return alert('저장된 폴더가 없습니다.');
  await scan(true);
};

$('scanBtn').onclick=()=>scan(true);

(async()=>{
  const saved=await loadRootHandle();
  if(saved){
    rootHandle=saved;
    if(await ensurePermission(saved,'readwrite',false)){
      await scan(false);
    }else{
      status.textContent=`이전에 선택한 폴더 "${saved.name}"가 저장되어 있습니다.`;
      setFolderReady(false);
    }
  }
})().catch(e=>{
  console.error(e);
  alert(e.message);
});
