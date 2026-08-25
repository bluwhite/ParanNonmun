
let rootHandle=null,pdfItems=[];
const $=id=>document.getElementById(id);
const chooseBtn=$('chooseBtn'),reopenBtn=$('reopenBtn'),scanBtn=$('scanBtn'),searchBox=$('searchBox'),pdfBody=$('pdfBody'),countText=$('countText'),statusEl=$('status'),envBadge=$('envBadge');
function setStatus(s){statusEl.textContent=s}
function fmt(n){if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB'}
async function walk(dir,prefix=''){
  const out=[];
  for await(const [name,h] of dir.entries()){
    const path=prefix?`${prefix}/${name}`:name;
    if(h.kind==='directory')out.push(...await walk(h,path));
    else if(h.kind==='file'&&name.toLowerCase().endsWith('.pdf')){
      const f=await h.getFile();out.push({name,path,size:f.size});
    }
  }
  return out;
}
async function scan(mayPrompt=true){
  if(!rootHandle)return;
  if(!await ensurePermission(rootHandle,'readwrite',mayPrompt)){setStatus('폴더 읽기/쓰기 권한이 필요합니다.');return}
  setStatus(`"${rootHandle.name}" 검색 중...`);
  pdfItems=await walk(rootHandle);pdfItems.sort((a,b)=>a.path.localeCompare(b.path,'ko'));scanBtn.disabled=false;render();setStatus(`PDF ${pdfItems.length}개를 찾았습니다.`);
}
function render(){
  const q=searchBox.value.trim().toLowerCase();
  const arr=pdfItems.filter(x=>x.name.toLowerCase().includes(q)||x.path.toLowerCase().includes(q));
  countText.textContent=`PDF ${arr.length}개`;pdfBody.replaceChildren();
  if(!arr.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='empty';td.textContent='PDF가 없습니다.';tr.append(td);pdfBody.append(tr);return}
  for(const x of arr){
    const tr=document.createElement('tr');
    const a=document.createElement('td');a.textContent=x.name;
    const b=document.createElement('td');b.textContent=x.path;b.className='path';
    const c=document.createElement('td');c.textContent=fmt(x.size);
    const d=document.createElement('td'),btn=document.createElement('button');btn.className='open-btn';btn.textContent='연속 스크롤로 열기';
    btn.onclick=()=>{const u=new URL('./viewer.html',location.href);u.searchParams.set('file',x.path);window.open(u,'_blank')};d.append(btn);tr.append(a,b,c,d);pdfBody.append(tr);
  }
}
searchBox.oninput=render;
chooseBtn.onclick=async()=>{try{rootHandle=await window.showDirectoryPicker({id:'paper-library-root',mode:'readwrite'});await saveRootHandle(rootHandle);await scan(true)}catch(e){if(e.name!=='AbortError')alert(e.message)}};
reopenBtn.onclick=async()=>{rootHandle=await loadRootHandle();if(!rootHandle)return alert('저장된 폴더가 없습니다.');await scan(true)};
scanBtn.onclick=()=>scan(true);
(async()=>{const ok=window.isSecureContext&&('showDirectoryPicker'in window);envBadge.textContent=ok?'Chrome/Edge 사용 가능':'환경 확인 필요';envBadge.className=ok?'badge ok':'badge bad';const h=await loadRootHandle();if(h){rootHandle=h;if(await ensurePermission(h,'readwrite',false))await scan(false);else setStatus(`이전에 선택한 폴더 "${h.name}"가 저장되어 있습니다.`)}})();
