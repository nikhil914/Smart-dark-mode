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

export type ContentMessage = FetchRequest | SimplifiedNotice;

export function isContentMessage(value: unknown): value is ContentMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'sdm:fetch') {
    return (
      (v.kind === 'css' || v.kind === 'image') && typeof v.url === 'string' && v.url.length < 4096
    );
  }
  if (v.type === 'sdm:simplified') return typeof v.origin === 'string';
  return false;
}
