/* Private Vault PWA. No network requests are made by this application code. */
(() => {
  "use strict";
  const DB_NAME = "private-vault-db-v1";
  const STORE = "records";
  const META = "meta";
  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let db, vaultKey = null, unlocked = false, lockTimer = null;
  const $ = id => document.getElementById(id);
  const show = (id, yes) => $(id).classList.toggle("hidden", !yes);
  const status = (id, msg) => $(id).textContent = msg;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, {keyPath:"id"});
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, {keyPath:"key"});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(store, mode="readonly") {
    return db.transaction(store, mode).objectStore(store);
  }
  function get(store, key) {
    return new Promise((resolve,reject)=>{const r=tx(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  function put(store, value) {
    return new Promise((resolve,reject)=>{const r=tx(store,"readwrite").put(value);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
  }
  function del(store,key) {
    return new Promise((resolve,reject)=>{const r=tx(store,"readwrite").delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
  }
  function all(store) {
    return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  const random = n => crypto.getRandomValues(new Uint8Array(n));
  async function derive(password, salt) {
    const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function encryptBytes(bytes, key) {
    const iv = random(12);
    const cipher = await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes);
    return {iv:[...iv], cipher};
  }
  async function decryptBytes(record,key) {
    return crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(record.iv)},key,record.cipher);
  }
  async function encryptedMeta(key, value) {
    const payload = enc.encode(JSON.stringify(value));
    return encryptBytes(payload,key);
  }
  async function readVaultMeta(keyName) { return get(META,keyName); }
  async function initialise(password) {
    const salt = random(16);
    const key = await derive(password,salt);
    const verifier = await encryptBytes(enc.encode("PrivateVault verifier v1"),key);
    await put(META,{key:"config",salt:[...salt],verifier});
    vaultKey = key;
    unlocked = true;
    await renderVault();
  }
  async function unlock(password) {
    const cfg = await readVaultMeta("config");
    if (!cfg) throw new Error("Vault setup is missing.");
    const candidate = await derive(password,new Uint8Array(cfg.salt));
    const plain = await decryptBytes(cfg.verifier,candidate);
    if (dec.decode(plain) !== "PrivateVault verifier v1") throw new Error("Incorrect password.");
    vaultKey = candidate;
    unlocked = true;
    await renderVault();
  }
  function lock() {
    vaultKey = null; unlocked = false;
    if (lockTimer) clearTimeout(lockTimer);
    show("vault",false);
    show("unlock",false); show("setup",false); show("home",true); show("appHeader",false);
    $("password").value = "";
    status("unlockStatus","Vault locked. Tap the menu three times to continue.");
  }
  function resetTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(lock, 60_000);
  }
  async function renderVault() {
    if (!vaultKey) return;
    const records = await all(STORE);
    const list = $("fileList"); list.replaceChildren();
    $("count").textContent = `${records.length} encrypted ${records.length===1?"file":"files"}`;
    show("empty",records.length===0);
    for (const record of records.sort((a,b)=>b.created-a.created)) {
      let info;
      try { info = JSON.parse(dec.decode(await decryptBytes(record.meta,vaultKey))); }
      catch { continue; }
      const row = document.createElement("div"); row.className="file";
      const icon = document.createElement("div"); icon.className="fileicon";
      icon.textContent = info.type.startsWith("image/") ? "🖼️" : info.type.startsWith("video/") ? "🎬" : info.type.startsWith("audio/") ? "🎵" : "📄";
      const details = document.createElement("div"); details.className="fileinfo";
      const name = document.createElement("div"); name.className="filename"; name.textContent=info.name;
      const sub = document.createElement("div"); sub.className="filesub"; sub.textContent=`${formatSize(info.size)} · ${new Date(record.created).toLocaleDateString()}`;
      details.append(name,sub);
      const exportBtn = document.createElement("button"); exportBtn.className="secondary"; exportBtn.textContent="Export";
      exportBtn.addEventListener("click",()=>exportFile(record,info));
      const deleteBtn = document.createElement("button"); deleteBtn.className="danger"; deleteBtn.textContent="Delete";
      deleteBtn.addEventListener("click",async()=>{if(confirm(`Permanently delete ${info.name} from this vault?`)){await del(STORE,record.id);await renderVault();}});
      row.append(icon,details,exportBtn,deleteBtn); list.append(row);
    }
    show("setup",false); show("unlock",false); show("home",false); show("appHeader",true); show("vault",true); resetTimer();
  }
  function formatSize(n) {
    if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`;
  }
  async function importFiles(fileList) {
    if (!vaultKey) throw new Error("Unlock the vault first.");
    const files = [...fileList];
    for (const file of files) {
      if (file.size > 300*1024*1024) throw new Error(`${file.name} is larger than 300 MB. Use smaller files for this browser version.`);
      status("fileStatus",`Encrypting ${file.name}…`);
      const raw = await file.arrayBuffer();
      const encryptedFile = await encryptBytes(raw,vaultKey);
      const encryptedInfo = await encryptedMeta(vaultKey,{name:file.name,type:file.type||"application/octet-stream",size:file.size});
      await put(STORE,{id:crypto.randomUUID(),iv:encryptedFile.iv,cipher:encryptedFile.cipher,meta:encryptedInfo,created:Date.now()});
    }
    status("fileStatus",`${files.length} file(s) encrypted and saved on this device.`);
    $("fileInput").value="";
    await renderVault();
  }
  async function exportFile(record, info) {
    try {
      const bytes = await decryptBytes(record,vaultKey);
      const blob = new Blob([bytes],{type:info.type});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=info.name; document.body.append(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
      status("fileStatus",`Decrypted export prepared: ${info.name}. Keep exported copies private.`);
    } catch { status("fileStatus","Could not decrypt this file."); }
  }
  async function exportBackup() {
    const cfg = await get(META,"config");
    const records = await all(STORE);
    const backup = {format:"PRIVATE_VAULT_BACKUP_V1",config:cfg,records:records.map(r=>({
      id:r.id,iv:r.iv,cipher:Array.from(new Uint8Array(r.cipher)),meta:r.meta,created:r.created
    }))};
    const blob = new Blob([JSON.stringify(backup)],{type:"application/octet-stream"});
    downloadBlob(blob,`PrivateVault-backup-${new Date().toISOString().slice(0,10)}.pvaultbackup`);
  }
  async function importBackup(file) {
    const parsed = JSON.parse(await file.text());
    if(parsed.format!=="PRIVATE_VAULT_BACKUP_V1"||!parsed.config||!Array.isArray(parsed.records)) throw new Error("This is not a valid Private Vault backup.");
    const existing = await get(META,"config");
    if(existing && !confirm("Importing this backup will replace the current vault data. Continue?")) return;
    const pass = prompt("Enter the password used when this backup was created:");
    if(!pass) return;
    const testKey = await derive(pass,new Uint8Array(parsed.config.salt));
    const verified = await decryptBytes(parsed.config.verifier,testKey);
    if(dec.decode(verified)!=="PrivateVault verifier v1") throw new Error("Password does not match this backup.");
    const old = await all(STORE);
    for(const r of old) await del(STORE,r.id);
    await put(META,parsed.config);
    for(const r of parsed.records) await put(STORE,{...r,cipher:new Uint8Array(r.cipher).buffer});
    vaultKey=testKey; unlocked=true;
    await renderVault();
    status("backupStatus","Backup restored successfully.");
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  async function start() {
    db = await openDB();
    const cfg = await readVaultMeta("config");
    show("home",true); show("appHeader",false); show("setup",false); show("unlock",false); show("vault",false);
    const updateClock = () => {
      const now = new Date();
      $("clockTime").textContent = now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
      $("clockDate").textContent = now.toLocaleDateString([], {weekday:"long",day:"numeric",month:"long",year:"numeric"});
    };
    updateClock(); setInterval(updateClock,1000);
    let menuTaps = 0, menuTapTimer = null;
    $("menuTap").addEventListener("click", () => {
      menuTaps++;
      status("menuHint", menuTaps === 1 ? "One tap" : menuTaps === 2 ? "Two taps" : "");
      if(menuTapTimer) clearTimeout(menuTapTimer);
      if(menuTaps >= 3) {
        menuTaps = 0; status("menuHint", "");
        show("home",false);
        show("setup",!cfg); show("unlock",!!cfg);
        if(cfg) $("password").focus(); else $("newPassword").focus();
      } else {
        menuTapTimer = setTimeout(() => { menuTaps=0; status("menuHint", "Tap the menu 3 times to open"); }, 1800);
      }
    });
    $("createBtn").addEventListener("click",async()=>{
      const p=$("newPassword").value,c=$("confirmPassword").value;
      if(p.length<12){status("setupStatus","Use at least 12 characters.");return;}
      if(p!==c){status("setupStatus","Passwords do not match.");return;}
      try{status("setupStatus","Creating encrypted vault…");await initialise(p);$("newPassword").value="";$("confirmPassword").value="";}
      catch(e){status("setupStatus",e.message);}
    });
    $("unlockBtn").addEventListener("click",async()=>{
      try{status("unlockStatus","Deriving encryption key…");await unlock($("password").value);$("password").value="";}
      catch(e){status("unlockStatus",e.message);}
    });
    $("lockBtn").addEventListener("click",lock);
    $("fileInput").addEventListener("change",async e=>{try{await importFiles(e.target.files);}catch(err){status("fileStatus",err.message);}});
    $("backupBtn").addEventListener("click",async()=>{try{await exportBackup();status("backupStatus","Encrypted backup exported. Store it securely.");}catch(e){status("backupStatus",e.message);}});
    $("restoreInput").addEventListener("change",async e=>{try{if(e.target.files[0])await importBackup(e.target.files[0]);}catch(err){status("backupStatus",err.message);}e.target.value="";});
    document.addEventListener("visibilitychange",()=>{if(document.hidden && unlocked) lock();});
    ["click","touchstart","keydown"].forEach(ev=>document.addEventListener(ev,()=>{if(unlocked)resetTimer();},{passive:true}));
    if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
  start().catch(e=>{document.body.innerHTML=`<main><h2>Private Vault could not start</h2><p>${String(e.message||e)}</p></main>`;});
})();
