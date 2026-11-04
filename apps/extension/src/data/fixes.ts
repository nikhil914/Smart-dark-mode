import { FIXES_FORMAT, type FixesBundle } from '@sdm/engine';

/**
 * Fixes built into the extension. Canvas-rendered apps cannot be converted through CSS,
 * so their drawing surface is inverted and images inside it are turned back (F11).
 * Selectors come from each app's public markup and need re-checking when the apps change.
 */
export const BUNDLED_FIXES: FixesBundle = {
  format: FIXES_FORMAT,
  version: 1,
  created: '2026-11-04',
  sites: [
    {
      url: ['docs.google.com/document'],
      invert: ['.kix-canvas-tile-content', '.kix-page-paginated canvas'],
      ignoreImageAnalysis: ['.kix-canvas-tile-content'],
    },
    {
      url: ['docs.google.com/spreadsheets'],
      invert: ['#waffle-grid-container canvas', '.grid4-inner-container canvas'],
    },
    {
      url: ['docs.google.com/presentation'],
      invert: ['.punch-filmstrip-thumbnail', '#workspace-container .punch-viewer-content'],
    },
    {
      url: ['google.com/maps', 'maps.google.com'],
      invert: ['canvas.widget-scene-canvas', '#scene canvas'],
    },
    {
      url: ['tradingview.com/chart', 'tradingview.com/symbols'],
      invert: ['.chart-container canvas'],
    },
    {
      url: ['notion.so', 'notion.site'],
      invert: ['.notion-embed-block canvas'],
    },
    {
      url: ['excalidraw.com'],
      invert: ['.excalidraw canvas.interactive', '.excalidraw canvas.static'],
    },
  ],
};
