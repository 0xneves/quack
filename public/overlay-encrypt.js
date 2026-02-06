(function () {
  const bubble = document.getElementById('bubble');
  const encryptText = document.getElementById('encrypt-text');
  const encryptKey = document.getElementById('encrypt-key');
  const title = document.getElementById('bubble-title');
  const keyRow = document.getElementById('key-row');
  const statusEl = document.getElementById('encrypt-status');
  const submitBtn = document.getElementById('encrypt-submit');
  const cancelBtn = document.getElementById('encrypt-cancel');

  let port = null;
  let currentCipher = '';
  const state = { dragging: false };

  function showStatus(msg, kind = 'info') {
    statusEl.textContent = msg || '';
    statusEl.className = 'status';
    if (msg) {
      statusEl.classList.add('visible');
      if (kind === 'error') statusEl.classList.add('error');
      if (kind === 'success') statusEl.classList.add('success');
    }
    requestResize();
  }

  function hideStatus() {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }

  function resetUI() {
    currentCipher = '';
    encryptText.readOnly = false;
    encryptText.value = '';
    hideStatus();
    if (keyRow) keyRow.style.display = '';
    if (submitBtn) {
      submitBtn.style.display = '';
      submitBtn.textContent = '🦆 Duck it';
      submitBtn.className = 'btn btn-primary';
    }
    if (cancelBtn) {
      cancelBtn.textContent = 'Dismiss';
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

  function setGroups(groups) {
    encryptKey.innerHTML = '';
    if (!groups || !groups.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No groups available';
      encryptKey.appendChild(opt);
      encryptKey.disabled = true;
    } else {
      groups.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g.id;
        const emoji = g.emoji ? g.emoji + ' ' : '';
        const fp = g.shortFingerprint ? ` (${g.shortFingerprint})` : '';
        let name = g.name || 'Unnamed group';
        if (name.length > 18) name = name.substring(0, 18) + '...';
        opt.textContent = `${emoji}${name}${fp}`;
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

  function showCopiedEffect() {
    if (!submitBtn) return;
    submitBtn.textContent = '✅ Copied!';
    submitBtn.classList.add('copied');
    setTimeout(() => {
      submitBtn.textContent = '📋 Copy Again';
      submitBtn.classList.remove('copied');
    }, 1500);
  }

  async function handlePortMessage(event) {
    const data = event.data;
    if (!data || data.quackOverlay !== true) return;
    switch (data.type) {
      case 'open-encrypt': {
        title.textContent = 'Encrypt';
        resetUI();
        setGroups(data.groups || []);
        encryptText.value = data.prefill || '';
        showBubble();
        encryptText.focus();
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
          currentCipher = data.cipher;
          encryptText.readOnly = true;
          encryptText.value = data.cipher;

          // Hide group selector
          if (keyRow) keyRow.style.display = 'none';

          // Auto-copy and show status
          const copied = await copyCipher(data.cipher);
          if (copied) {
            showStatus('Copied to clipboard!', 'success');
          } else {
            showStatus('Encrypted but copy failed. Copy manually.', 'error');
          }

          // Switch footer: Copy Again (orange, left) | Close (gray, right)
          if (submitBtn) {
            submitBtn.textContent = '📋 Copy Again';
            submitBtn.className = 'btn btn-primary';
            submitBtn.style.display = '';
          }
          if (cancelBtn) {
            cancelBtn.textContent = '✕ Close';
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

  // Auto-resize iframe when textarea is manually resized by the user
  if (encryptText && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => requestResize()).observe(encryptText);
  }

  document.getElementById('close-btn')?.addEventListener('click', closeBubble);

  submitBtn?.addEventListener('click', async () => {
    // If cipher is ready, this is the Copy button
    if (currentCipher) {
      const copied = await copyCipher(currentCipher);
      if (copied) {
        showCopiedEffect();
        showStatus('Copied to clipboard!', 'success');
      } else {
        showStatus('Copy failed. Try selecting the text manually.', 'error');
      }
      return;
    }

    // Otherwise, encrypt
    port?.postMessage({
      quackOverlay: true,
      type: 'encrypt-request',
      plaintext: encryptText.value || '',
      groupId: encryptKey.value,
    });
  });

  cancelBtn?.addEventListener('click', closeBubble);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBubble();
    }
  });

  // Drag support
  const dragHandle = document.getElementById('drag-handle');
  dragHandle?.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking on close button or interactive elements
    if (e.target.closest('.close-btn')) return;
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
