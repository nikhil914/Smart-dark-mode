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

export type ContentMessage = FetchRequest | SimplifiedNotice | PdfOriginalRequest;

/** Popup to the page's top frame. */
export interface StatusRequest {
  type: 'sdm:status';
}

export interface PageStatus {
  /** Name of the site theme we switched on, if any. */
  siteTheme: string | null;
  /** The page has its own dark theme and is shown as is. */
  nativeDark: boolean;
  /** Original colours on the page, most used first. */
  palette: { hex: string; roles: string[]; count: number }[];
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
  if (v.type === 'sdm:pdf-original') {
    return typeof v.url === 'string' && v.url.length < 8192 && /^https?:/i.test(v.url);
  }
  return false;
}
