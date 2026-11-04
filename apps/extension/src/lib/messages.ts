/** Messages between content scripts and the background. */
export type FetchKind = 'css' | 'image';

export interface FetchRequest {
  type: 'sdm:fetch';
  kind: FetchKind;
  url: string;
}

export type FetchResponse = { ok: true; data: string } | { ok: false; error: string };

export interface SimplifiedNotice {
  type: 'sdm:simplified';
  origin: string;
}

/** Opens a PDF without the viewer, once, in the sender's tab. */
export interface PdfOriginalRequest {
  type: 'sdm:pdf-original';
  url: string;
}

/** Site fixes for the sender's page. */
export interface FixesRequest {
  type: 'sdm:fixes';
  host: string;
  path: string;
}

/** Options page: download the fixes bundle now. */
export interface FixesUpdateRequest {
  type: 'sdm:fixes-update';
}

export type ContentMessage =
  FetchRequest | SimplifiedNotice | PdfOriginalRequest | FixesRequest | FixesUpdateRequest;

/** Popup to the page's top frame. */
export interface StatusRequest {
  type: 'sdm:status';
}

/** Popup, context menu or keyboard to the page's top frame: start a page tool. */
export interface ToolRequest {
  type: 'sdm:tool';
  tool: 'picker' | 'debug' | 'export';
  /** Picker only: select the element under the last right click. */
  atContextMenu?: boolean;
}

export function isToolRequest(value: unknown): value is ToolRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === 'sdm:tool' && (v.tool === 'picker' || v.tool === 'debug' || v.tool === 'export')
  );
}

export interface PageStatus {
  /** Name of the site theme we switched on, if any. */
  siteTheme: string | null;
  /** The page has its own dark theme and is shown as is. */
  nativeDark: boolean;
  /** Original colours on the page, most used first. */
  palette: { hex: string; roles: string[]; count: number }[];
  /** The page is converted by the engine, so the page tools can be used. */
  engine: boolean;
  /** The debug overlay is showing. */
  debug: boolean;
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'sdm:fetch') {
    return (
      (v.kind === 'css' || v.kind === 'image') && typeof v.url === 'string' && v.url.length < 4096
    );
  }
  if (v.type === 'sdm:simplified') return typeof v.origin === 'string';
  if (v.type === 'sdm:fixes-update') return true;
  if (v.type === 'sdm:fixes') {
    return (
      typeof v.host === 'string' &&
      v.host.length < 300 &&
      typeof v.path === 'string' &&
      v.path.length < 4096
    );
  }
  if (v.type === 'sdm:pdf-original') {
    return typeof v.url === 'string' && v.url.length < 8192 && /^https?:/i.test(v.url);
  }
  return false;
}
