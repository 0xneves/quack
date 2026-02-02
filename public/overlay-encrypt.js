(function () {
  const bubble = document.getElementById('bubble');
  const encryptText = document.getElementById('encrypt-text');
  const encryptKey = document.getElementById('encrypt-key');
  const title = document.getElementById('bubble-title');
  const keyRow = document.querySelector('.row');
  const buttonsRow = document.querySelector('.buttons');
  const submitBtn = document.getElementById('encrypt-submit');
  const cancelBtn = document.getElementById('encrypt-cancel');

  let port = null;
  const state = { dragging: false };

  const statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.id = 'encrypt-status';
  buttonsRow?.after(statusEl);

  function showStatus(msg, kind = 'info') {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', kind === 'error');
    requestResize();
  }

  function resetUI() {
    encryptText.readOnly = false;
    encryptText.value = '';
    showStatus('');
    if (keyRow) keyRow.style.display = '';
    if (submitBtn) {
      submitBtn.style.display = '';
      submitBtn.textContent = 'Duck it';
    }
    if (cancelBtn) {
      cancelBtn.textContent = 'Dismiss';
      cancelBtn.style.flex = '1';
    }
    if (buttonsRow) {
      buttonsRow.style.flexDirection = '';
    }
  }

  function showBubble() {
    bubble.style.display = 'flex';
  }

  function hideBubble() {
    bubble.style.display = 'none';
    encryptText.value = '';
  }

  function closeBubble() {
    port?.postMessage({ quackOverlay: true, type: 'close' });
    hideBubble();
  }

  function setKeys(keys) {
    encryptKey.innerHTML = '';
    if (!keys || !keys.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No keys available';
      encryptKey.appendChild(opt);
      encryptKey.disabled = true;
    } else {
      keys.forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.name || 'Unnamed key';
        encryptKey.appendChild(opt);
      });
      encryptKey.disabled = false;
    }
  }

  async function copyCipher(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  async function handlePortMessage(event) {
    const data = event.data;
    if (!data || data.quackOverlay !== true) return;
    switch (data.type) {
      case 'open-encrypt': {
        title.textContent = 'Quack';
        resetUI();
        setKeys(data.keys || []);
        encryptText.value = data.prefill || '';
        showBubble();
        requestResize();
        break;
      }
      case 'encrypt-result': {
        if (data.error) {
          showStatus(data.error || 'Encryption failed', 'error');
          encryptText.readOnly = false;
          return;
        }
        if (data.cipher) {
          encryptText.readOnly = true;
          encryptText.value = data.cipher;
          showStatus('Encrypted message copied to clipboard!', 'info');
          if (keyRow) keyRow.style.display = 'none';
          if (submitBtn) submitBtn.style.display = 'none';
          if (cancelBtn) {
            cancelBtn.textContent = 'Dismiss';
            cancelBtn.style.flex = '1';
          }
          const copied = await copyCipher(data.cipher);
          if (!copied) {
            showStatus('Encrypted but copy failed. Copy manually.', 'error');
          }
          requestResize();
        }
        break;
      }
      case 'hide': {
        hideBubble();
        break;
      }
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.quackOverlay !== true || data.type !== 'init') return;
    const receivedPort = event.ports && event.ports[0];
    if (!receivedPort) return;
    port = receivedPort;
    port.onmessage = handlePortMessage;
  });

  function requestResize() {
    if (!port) return;
    requestAnimationFrame(() => {
      const height = bubble.scrollHeight;
      port?.postMessage({ quackOverlay: true, type: 'resize', height });
    });
  }

  document.getElementById('close-btn')?.addEventListener('click', closeBubble);

  submitBtn?.addEventListener('click', () => {
    port?.postMessage({
      quackOverlay: true,
      type: 'encrypt-request',
      plaintext: encryptText.value || '',
      keyId: encryptKey.value,
    });
  });

  cancelBtn?.addEventListener('click', closeBubble);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBubble();
    }
  });

  const dragHandle = document.getElementById('drag-handle');
  dragHandle?.addEventListener('mousedown', () => {
    state.dragging = true;
    port?.postMessage({ quackOverlay: true, type: 'drag-start' });
  });
  window.addEventListener('mouseup', () => {
    if (state.dragging) {
      state.dragging = false;
      port?.postMessage({ quackOverlay: true, type: 'drag-end' });
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!state.dragging) return;
    port?.postMessage({
      quackOverlay: true,
      type: 'drag-move',
      deltaX: e.movementX,
      deltaY: e.movementY,
    });
  });
})();
