(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WashStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createStore(indexedDB, scope = '') {
    const scoped = key => scope ? scope + ':' + key : key;
    let opening;
    function open() {
      if (!indexedDB) return Promise.reject(new Error('El navegador no permite guardar el borrador. Exporte un respaldo JSON.'));
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('wash-fit-drafts', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('drafts');
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
        request.onerror = () => { opening = null; reject(request.error); };
        request.onblocked = () => { opening = null; reject(new Error('Cierre otras pestañas de WASH FIT para abrir el borrador.')); };
      });
      return opening;
    }
    async function read(key = 'current') {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readonly');
        const request = tx.objectStore('drafts').get(scoped(key));
        let result;
        request.onsuccess = () => { result = request.result ?? null; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('No se pudo leer el borrador.'));
      });
    }
    async function save(dataset, backup = false) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts');
        if (backup) store.put(dataset, scoped('backup'));
        store.put(dataset, scoped('current'));
        tx.oncomplete = () => resolve(dataset.savedAt);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar el borrador.'));
      });
    }
    async function write(key, value) {
      const db = await open();
      return new Promise((resolve,reject) => {const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,scoped(key));tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
    }
    async function update(key,change){
      const db=await open();
      return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(scoped(key));
        request.onsuccess=()=>{try{store.put(change(request.result||{}),scoped(key));}catch(e){tx.abort();reject(e);}};
        tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('No se pudo actualizar el borrador.'));
      });
    }
    return { read, save, write, update };
  }
  return { createStore };
});
