export function windowDrag(getApp: () => foundry.applications.api.ApplicationV2) {
  let dragging = $state(false);
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  return {
    get dragging(): boolean {
      return dragging;
    },
    start(e: PointerEvent): void {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      dragging = true;
      const rect = getApp().element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    move(e: PointerEvent): void {
      if (!dragging) return;
      getApp().setPosition({ left: startLeft + (e.clientX - startX), top: startTop + (e.clientY - startY) });
    },
    end(e: PointerEvent): void {
      if (!dragging) return;
      dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
  };
}
