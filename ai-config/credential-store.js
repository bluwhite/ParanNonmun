/* 파란 논문 - Groq AI 설정 암호화 저장
 * 파란논문_ai.json에는 Groq API Key가 평문으로 저장되지 않는다.
 * AES-GCM CryptoKey는 extractable:false로 생성해 IndexedDB에 저장하고,
 * 저장 당시 논문 폴더 FileSystemDirectoryHandle과 함께 묶는다.
 */
(function(global){
  "use strict";

  const CONFIG_FILE_NAME="파란논문_ai.json";
  const DB_NAME="paran-paper-ai-secure-v1";
  const STORE_NAME="folder-keys";
  const CONFIG_VERSION=2;
  const PROVIDER="groq";
  const MODEL="qwen/qwen3.6-27b";

  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME)){
          db.createObjectStore(STORE_NAME,{keyPath:"keyId"});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function putRecord(record){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function getRecord(keyId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(STORE_NAME,"readonly")
        .objectStore(STORE_NAME).get(keyId);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error);
    });
  }

  async function deleteRecord(keyId){
    if(!keyId)return;
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readwrite");
      tx.objectStore(STORE_NAME).delete(keyId);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  function bytesToBase64(bytes){
    let binary="";
    const block=0x8000;
    for(let i=0;i<bytes.length;i+=block){
      binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+block,bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value){
    const binary=atob(String(value||""));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }

  function normalizeApiKey(value){
    const key=String(value||"").trim();
    if(!key)throw new Error("Groq API Key를 입력하세요.");
    if(key.length<20)throw new Error("Groq API Key 형식을 확인하세요.");
    return key;
  }

  async function readEnvelope(rootHandle){
    try{
      const handle=await rootHandle.getFileHandle(CONFIG_FILE_NAME);
      const file=await handle.getFile();
      const text=(await file.text()).replace(/^\uFEFF/,"").trim();
      if(!text)return null;
      return JSON.parse(text);
    }catch(error){
      if(error?.name==="NotFoundError")return null;
      throw error;
    }
  }

  async function writeEnvelope(rootHandle,envelope){
    const handle=await rootHandle.getFileHandle(CONFIG_FILE_NAME,{create:true});
    const writable=await handle.createWritable();
    try{
      await writable.write(JSON.stringify(envelope,null,2)+"\n");
    }finally{
      await writable.close();
    }
  }

  async function sameFolder(rootHandle,storedHandle){
    if(!rootHandle || !storedHandle || typeof rootHandle.isSameEntry!=="function")return false;
    try{
      return await rootHandle.isSameEntry(storedHandle);
    }catch(_error){
      return false;
    }
  }

  async function saveConfig(rootHandle,config){
    if(!rootHandle)throw new Error("먼저 논문 폴더를 선택하세요.");

    const apiKey=normalizeApiKey(config?.apiKey);
    const previous=await readEnvelope(rootHandle);
    const previousKeyId=previous?.keyId||null;

    const cryptoKey=await crypto.subtle.generateKey(
      {name:"AES-GCM",length:256},
      false,
      ["encrypt","decrypt"]
    );

    const keyId=crypto.randomUUID();
    const iv=new Uint8Array(12);
    crypto.getRandomValues(iv);

    const plain={provider:PROVIDER,model:MODEL,apiKey};
    const encoded=new TextEncoder().encode(JSON.stringify(plain));
    const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},cryptoKey,encoded);

    await putRecord({
      keyId,
      key:cryptoKey,
      folderHandle:rootHandle,
      createdAt:new Date().toISOString()
    });

    const envelope={
      app:"파란 논문",
      type:"ai-config",
      version:CONFIG_VERSION,
      provider:PROVIDER,
      model:MODEL,
      algorithm:"AES-GCM",
      keyId,
      iv:bytesToBase64(iv),
      ciphertext:bytesToBase64(new Uint8Array(encrypted)),
      updatedAt:new Date().toISOString()
    };

    try{
      await writeEnvelope(rootHandle,envelope);
    }catch(error){
      await deleteRecord(keyId).catch(()=>{});
      throw error;
    }

    if(previousKeyId && previousKeyId!==keyId){
      await deleteRecord(previousKeyId).catch(()=>{});
    }

    return {provider:PROVIDER,model:MODEL,apiKey};
  }

  async function loadConfig(rootHandle){
    if(!rootHandle)return null;

    const envelope=await readEnvelope(rootHandle);
    if(!envelope)return null;

    if(envelope.provider && envelope.provider!==PROVIDER){
      throw new Error(
        "이전 AI 설정이 발견되었습니다. Groq API Key를 다시 저장하세요."
      );
    }

    if(
      envelope.type!=="ai-config" ||
      Number(envelope.version)!==CONFIG_VERSION ||
      !envelope.keyId || !envelope.iv || !envelope.ciphertext
    ){
      throw new Error(
        `${CONFIG_FILE_NAME}은 이전 형식입니다. Groq API Key를 다시 저장하세요.`
      );
    }

    const record=await getRecord(envelope.keyId);
    if(!record?.key){
      throw new Error(
        "이 AI 설정을 복호화할 로컬 키가 없습니다. 다른 PC/브라우저에서 가져온 파일이거나 " +
        "브라우저 사이트 데이터가 삭제되었습니다. Groq API Key를 다시 저장하세요."
      );
    }

    if(!await sameFolder(rootHandle,record.folderHandle)){
      throw new Error(
        "이 AI 설정은 현재 논문 폴더용이 아닙니다. 이 폴더에서 Groq API Key를 다시 저장하세요."
      );
    }

    let plainBuffer;
    try{
      plainBuffer=await crypto.subtle.decrypt(
        {name:"AES-GCM",iv:base64ToBytes(envelope.iv)},
        record.key,
        base64ToBytes(envelope.ciphertext)
      );
    }catch(_error){
      throw new Error("AI 설정 복호화에 실패했습니다. Groq API Key를 다시 저장하세요.");
    }

    let plain;
    try{
      plain=JSON.parse(new TextDecoder().decode(plainBuffer));
    }catch(_error){
      throw new Error("복호화된 AI 설정 형식이 올바르지 않습니다.");
    }

    return {
      provider:PROVIDER,
      model:MODEL,
      apiKey:normalizeApiKey(plain.apiKey)
    };
  }

  async function hasConfig(rootHandle){
    try{
      return !!await loadConfig(rootHandle);
    }catch(_error){
      return false;
    }
  }

  global.ParanAiConfig=Object.freeze({
    CONFIG_FILE_NAME,
    PROVIDER,
    MODEL,
    saveConfig,
    loadConfig,
    hasConfig
  });
})(window);
