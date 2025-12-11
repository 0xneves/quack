(function () {
  const bubble = document.getElementById('bubble');
  const decryptSection = document.getElementById('decrypt-section');
  const encryptSection = document.getElementById('encrypt-section');
  const decryptCipher = document.getElementById('decrypt-cipher');
  const decryptPlain = document.getElementById('decrypt-plain');
  const decryptStatus = document.getElementById('decrypt-status');
  const encryptText = document.getElementById('encrypt-text');
  const encryptKey = document.getElementById('encrypt-key');
  const encryptOutput = document.getElementById('encrypt-output');
  const encryptStatus = document.getElementById('encrypt-status');
  const title = document.getElementById('bubble-title');

  const state = {
    mode: null,
    dragging: false,
  };
  let port = null;

  function showBubble(mode) {
    state.mode = mode;
    decryptSection.hidden = mode !== 'decrypt';
    encryptSection.hidden = mode !== 'encrypt';
    bubble.style.display = 'flex';
  }

  function hideBubble() {
    bubble.style.display = 'none';
    state.mode = null;
    encryptText.value = '';
    encryptOutput.textContent = '';
    encryptStatus.textContent = '';
    decryptCipher.textContent = '';
    decryptPlain.textContent = '';
    decryptStatus.textContent = '';
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

  function handlePortMessage(event) {
    const data = event.data;
    if (!data || data.quackOverlay !== true) return;
    switch (data.type) {
      case 'open-decrypt': {
        title.textContent = 'Decrypt';
        decryptCipher.textContent = data.ciphertext || '';
        decryptPlain.textContent = data.plaintext || '';
        decryptStatus.textContent = data.keyName ? `Decrypted with ${data.keyName}` : (data.error || '');
        decryptStatus.className = 'status' + (data.error ? ' error' : '');
        showBubble('decrypt');
        break;
      }
      case 'open-encrypt': {
        title.textContent = 'Encrypt';
        setKeys(data.keys || []);
        encryptText.value = data.prefill || '';
        encryptOutput.textContent = '';
        encryptStatus.textContent = '';
        showBubble('encrypt');
        break;
      }
      case 'encrypt-result': {
        encryptOutput.textContent = data.cipher || '';
        encryptStatus.textContent = data.error ? data.error : (data.cipher ? 'Copied to clipboard' : '');
        encryptStatus.className = 'status' + (data.error ? ' error' : '');
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

  document.getElementById('close-btn')?.addEventListener('click', () => {
    port?.postMessage({ quackOverlay: true, type: 'close' });
    hideBubble();
  });

  document.getElementById('copy-plain')?.addEventListener('click', () => {
    port?.postMessage({ quackOverlay: true, type: 'copy', text: decryptPlain.textContent || '' });
  });
  document.getElementById('copy-cipher')?.addEventListener('click', () => {
    port?.postMessage({ quackOverlay: true, type: 'copy', text: decryptCipher.textContent || '' });
  });

  document.getElementById('encrypt-submit')?.addEventListener('click', () => {
    if (!encryptKey.value) {
      encryptStatus.textContent = 'No key available';
      encryptStatus.className = 'status error';
      return;
    }
    port?.postMessage({
      quackOverlay: true,
      type: 'encrypt-request',
      plaintext: encryptText.value || '',
      keyId: encryptKey.value,
    });
  });

  document.getElementById('encrypt-cancel')?.addEventListener('click', () => {
    port?.postMessage({ quackOverlay: true, type: 'close' });
    hideBubble();
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
