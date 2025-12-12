(function () {
  const bubble = document.getElementById('bubble');
  const encryptText = document.getElementById('encrypt-text');
  const encryptKey = document.getElementById('encrypt-key');
  const title = document.getElementById('bubble-title');

  let port = null;
  const state = { dragging: false };

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

  function handlePortMessage(event) {
    const data = event.data;
    if (!data || data.quackOverlay !== true) return;
    switch (data.type) {
      case 'open-encrypt': {
        title.textContent = 'Quack';
        setKeys(data.keys || []);
        encryptText.value = data.prefill || '';
        showBubble();
        requestResize();
        break;
      }
      case 'encrypt-result': {
        // No output/status UI; content script will hide overlay on success/failure
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

  document.getElementById('encrypt-submit')?.addEventListener('click', () => {
    port?.postMessage({
      quackOverlay: true,
      type: 'encrypt-request',
      plaintext: encryptText.value || '',
      keyId: encryptKey.value,
    });
  });

  document.getElementById('encrypt-cancel')?.addEventListener('click', closeBubble);

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
