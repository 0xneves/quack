/**
 * Quack - Helper Utilities
 */

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Base64 encode a Uint8Array
 */
export function base64Encode(data: Uint8Array): string {
  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Base64 decode to Uint8Array
 */
export function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert ArrayBuffer to Uint8Array
 */
export function bufferToUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/**
 * Format timestamp to human-readable date
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if element is editable
 */
export function isEditableElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input' || tagName === 'textarea') {
    return !(element as HTMLInputElement).disabled && 
           !(element as HTMLInputElement).readOnly;
  }
  
  if ((element as HTMLElement).isContentEditable) {
    return true;
  }
  
  return false;
}

/**
 * Get value from editable element
 */
export function getElementValue(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input' || tagName === 'textarea') {
    return (element as HTMLInputElement).value;
  }
  
  if ((element as HTMLElement).isContentEditable) {
    return (element as HTMLElement).textContent || '';
  }
  
  return '';
}

/**
 * Set value to editable element
 */
export function setElementValue(element: Element, value: string): void {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input' || tagName === 'textarea') {
    (element as HTMLInputElement).value = value;
    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else if ((element as HTMLElement).isContentEditable) {
    (element as HTMLElement).textContent = value;
    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

