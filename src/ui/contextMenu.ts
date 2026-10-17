// v14's entry shape; the bundled typings still describe the deprecated name/condition/callback.
export interface ContextMenuEntry {
  label: string;
  icon: string;
  visible?: (target: HTMLElement) => boolean;
  onClick: (event: PointerEvent, target: HTMLElement) => void;
}
