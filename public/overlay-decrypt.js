(function () {
  const bubble = document.getElementById('bubble');
  const decryptPlain = document.getElementById('decrypt-plain');
  const decryptStatus = document.getElementById('decrypt-status');
  const title = document.getElementById('bubble-title');

  let port = null;
  const state = {
    dragging: false,
  };

  function showBubble() {
    bubble.style.display = 'flex';
  }

  function hideBubble() {
    bubble.style.display = 'none';
    decryptPlain.textContent = '';
    decryptStatus.textContent = '';
  }

  function handlePortMessage(event) {
    const data = event.data;
    if (!data || data.quackOverlay !== true) return;
    switch (data.type) {
      case 'open-decrypt': {
        title.textContent = 'Quack';
        decryptPlain.textContent = data.plaintext || '';
        decryptStatus.textContent = data.keyName ? `Decrypted with ${data.keyName}` : (data.error || '');
        decryptStatus.className = 'status' + (data.error ? ' error' : '');
        showBubble();
        requestResize();
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

  document.getElementById('close-btn')?.addEventListener('click', () => {
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
