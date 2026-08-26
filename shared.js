const APP_VERSION = "0.7.0";

const DB_NAME='paper-pdf-singlefile-db';
const STORE='handles';
function openDb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function saveRootHandle(h){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(h,'root');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
async function loadRootHandle(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(STORE,'readonly').objectStore(STORE).get('root');
    r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
  });
}
async function ensurePermission(h,mode='readwrite',mayPrompt=true){
  const opt={mode};
  if(await h.queryPermission(opt)==='granted')return true;
  if(!mayPrompt)return false;
  return await h.requestPermission(opt)==='granted';
}
async function resolveFile(root,path){
  const parts=path.replaceAll('\\','/').split('/').filter(Boolean);
  let dir=root;
  for(let i=0;i<parts.length-1;i++)dir=await dir.getDirectoryHandle(parts[i]);
  const fileName=parts[parts.length-1];
  return {fileHandle:await dir.getFileHandle(fileName),parentHandle:dir,fileName};
}
