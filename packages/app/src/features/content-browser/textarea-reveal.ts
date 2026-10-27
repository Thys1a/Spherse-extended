const MAX_MIRROR_PREFIX_LENGTH = 200_000;

export function measureMatchCenter(textarea: HTMLTextAreaElement, offset: number): number | null {
  const value = textarea.value;
  const safeOffset = Math.min(Math.max(0, offset), value.length);
  if (safeOffset > MAX_MIRROR_PREFIX_LENGTH) return null;
  const doc = textarea.ownerDocument;
  const view = doc.defaultView;
  const style = view?.getComputedStyle(textarea);
  if (!style) return null;
  const parsePx = (raw: string): number => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const fontSize = parsePx(style.fontSize);
  if (!(fontSize > 0)) return null;
  const mirror = doc.createElement("div");
  const marker = doc.createElement("span");
  try {
    mirror.style.boxSizing = "content-box";
    mirror.style.width = `${Math.max(
      0,
      textarea.clientWidth - parsePx(style.paddingLeft) - parsePx(style.paddingRight),
    )}px`;
    mirror.style.padding = "0";
    mirror.style.border = "0";
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.wordSpacing = style.wordSpacing;
    mirror.style.textTransform = style.textTransform;
    mirror.style.textIndent = style.textIndent;
    mirror.style.tabSize = style.tabSize;
    mirror.style.direction = style.direction;
    mirror.style.writingMode = style.writingMode;
    mirror.style.whiteSpace = style.whiteSpace;
    mirror.style.overflowWrap = style.overflowWrap;
    mirror.style.wordBreak = style.wordBreak;
    mirror.style.position = "fixed";
    mirror.style.top = "0";
    mirror.style.left = "0";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.overflow = "hidden";
    mirror.append(doc.createTextNode(value.slice(0, safeOffset)));
    marker.textContent = "​";
    mirror.append(marker);
    doc.body.append(mirror);
    const parsedLineHeight = Number.parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.2;
    const center = marker.offsetTop + lineHeight / 2;
    if (!Number.isFinite(center) || (safeOffset > 0 && center <= 0)) return null;
    return center;
  } catch {
    return null;
  } finally {
    mirror.remove();
  }
}

export function scheduleCenter(
  textarea: HTMLTextAreaElement,
  offset: number,
  frameRef: { current: number | null },
): void {
  cancelCenter(frameRef);
  frameRef.current = requestAnimationFrame(() => {
    frameRef.current = null;
    const center = measureMatchCenter(textarea, offset);
    if (center === null) return;
    const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTop = Math.min(Math.max(0, center - textarea.clientHeight / 2), maxScroll);
  });
}

export function cancelCenter(frameRef: { current: number | null }): void {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}
