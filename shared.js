
const APP_DB_NAME = 'paper-pdf-local-db';
const APP_STORE = 'handles';
const ROOT_KEY = 'root';

function openAppDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(APP_DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(APP_STORE)){
        req.result.createObjectStore(APP_STORE);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveRootHandle(handle){
  const db=await openAppDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(APP_STORE,'readwrite');
    tx.objectStore(APP_STORE).put(handle,ROOT_KEY);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

async function loadRootHandle(){
  const db=await openAppDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(APP_STORE,'readonly').objectStore(APP_STORE).get(ROOT_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

async function ensurePermission(handle, mode='readwrite', mayPrompt=true){
  const opt={mode};
  if(await handle.queryPermission(opt)==='granted') return true;
  if(!mayPrompt) return false;
  return await handle.requestPermission(opt)==='granted';
}

async function getFileHandleFromRelativePath(rootHandle, relativePath){
  const parts=relativePath.replaceAll('\\','/').split('/').filter(Boolean);
  if(!parts.length) throw new Error('파일 경로가 비어 있습니다.');

  let dir=rootHandle;
  for(let i=0;i<parts.length-1;i++){
    dir=await dir.getDirectoryHandle(parts[i]);
  }

  const fileName=parts[parts.length-1];
  const fileHandle=await dir.getFileHandle(fileName);
  return {fileHandle,parentHandle:dir,fileName};
}
