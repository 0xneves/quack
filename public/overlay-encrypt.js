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
  let stealthMode = false;
  const state = { dragging: false };
  
  // Create stealth mode toggle (inserted dynamically)
  function createStealthRow() {
    const existing = document.getElementById('stealth-row');
    if (existing) return existing;
    
    const stealthRow = document.createElement('div');
    stealthRow.id = 'stealth-row';
    stealthRow.className = 'form-row';
    stealthRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 4px 0 2px 0;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'stealth-checkbox';
    checkbox.style.cssText = 'cursor: pointer; width: 14px; height: 14px;';
    checkbox.checked = stealthMode;
    checkbox.addEventListener('change', (e) => {
      stealthMode = e.target.checked;
    });
    
    const label = document.createElement('label');
    label.htmlFor = 'stealth-checkbox';
    label.style.cssText = 'cursor: pointer; font-size: 13px; font-weight: 500; color: #374151; margin-left: 2px;';
    label.textContent = '  🥷 Stealth Mode';
    
    stealthRow.appendChild(checkbox);
    stealthRow.appendChild(label);
    
    return stealthRow;
  }

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
    stealthMode = false;
    encryptText.readOnly = false;
    encryptText.value = '';
    hideStatus();
    if (keyRow) {
      keyRow.style.display = '';
      // Add stealth toggle after key row
      const stealthRow = createStealthRow();
      if (stealthRow.parentElement !== keyRow.parentElement) {
        keyRow.parentElement.insertBefore(stealthRow, keyRow.nextSibling);
      }
      stealthRow.style.display = '';
      const checkbox = document.getElementById('stealth-checkbox');
      if (checkbox) checkbox.checked = false;
    }
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

  function setTargets(personalKeys, groups) {
    encryptKey.innerHTML = '';
    
    const hasIdentities = personalKeys && personalKeys.length > 0;
    const hasGroups = groups && groups.length > 0;
    
    if (!hasIdentities && !hasGroups) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No encryption targets available';
      encryptKey.appendChild(opt);
      encryptKey.disabled = true;
      return;
    }
    
    // Add placeholder
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select target...';
    encryptKey.appendChild(placeholder);
    
    // Add identities first (personal encryption)
    if (hasIdentities) {
      const identitySeparator = document.createElement('option');
      identitySeparator.disabled = true;
      identitySeparator.textContent = '── Identities (Personal) ──';
      encryptKey.appendChild(identitySeparator);
      
      personalKeys.forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k.id;
        const fp = k.shortFingerprint ? ` (${k.shortFingerprint})` : '';
        let name = k.name || 'Unnamed identity';
        if (name.length > 16) name = name.substring(0, 16) + '...';
        opt.textContent = `🔑 ${name}${fp}`;
        encryptKey.appendChild(opt);
      });
    }
    
    // Add groups (shared encryption)
    if (hasGroups) {
      const groupSeparator = document.createElement('option');
      groupSeparator.disabled = true;
      groupSeparator.textContent = '── Groups (Shared) ──';
      encryptKey.appendChild(groupSeparator);
      
      groups.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g.id;
        const emoji = g.emoji ? g.emoji + ' ' : '👥 ';
        const fp = g.shortFingerprint ? ` (${g.shortFingerprint})` : '';
        let name = g.name || 'Unnamed group';
        if (name.length > 16) name = name.substring(0, 16) + '...';
        opt.textContent = `${emoji}${name}${fp}`;
        encryptKey.appendChild(opt);
      });
    }
    
    encryptKey.disabled = false;
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
        setTargets(data.personalKeys || [], data.groups || []);
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

          // Hide group selector and stealth toggle
          if (keyRow) keyRow.style.display = 'none';
          const stealthRow = document.getElementById('stealth-row');
          if (stealthRow) stealthRow.style.display = 'none';

          // Auto-copy and show status
          const copied = await copyCipher(data.cipher);
          const stealthLabel = data.stealth ? ' (🥷 stealth)' : '';
          if (copied) {
            showStatus(`Copied to clipboard!${stealthLabel}`, 'success');
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
      stealth: stealthMode,
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
