import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'wxt';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));

/**
 * pdf.js data the viewer loads at run time: the standard 14 fonts (for PDFs that do not
 * embed them) and the JPEG 2000 / JBIG2 decoders used by scanned documents. CMaps for
 * legacy CJK encodings are left out to keep the package small.
 */
function pdfjsAssets(): { absoluteSrc: string; relativeDest: string }[] {
  const out: { absoluteSrc: string; relativeDest: string }[] = [];
  for (const file of readdirSync(join(pdfjsRoot, 'standard_fonts'))) {
    out.push({
      absoluteSrc: join(pdfjsRoot, 'standard_fonts', file),
      relativeDest: `pdfjs/standard_fonts/${file}`,
    });
  }
  for (const file of [
    'jbig2.wasm',
    'openjpeg.wasm',
    'LICENSE_JBIG2',
    'LICENSE_OPENJPEG',
    'LICENSE_PDFJS_JBIG2',
    'LICENSE_PDFJS_OPENJPEG',
  ]) {
    out.push({ absoluteSrc: join(pdfjsRoot, 'wasm', file), relativeDest: `pdfjs/wasm/${file}` });
  }
  out.push({ absoluteSrc: join(pdfjsRoot, 'LICENSE'), relativeDest: 'pdfjs/LICENSE' });
  return out;
}

// One config, every target. Browser-specific manifest keys are added by `manifest()`.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      files.push(...pdfjsAssets());
    },
  },
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: [
      'storage',
      'tabs',
      'alarms',
      'scripting',
      'contextMenus',
      'declarativeNetRequestWithHostAccess',
      ...(browser === 'firefox' ? ['dns'] : []),
    ],
    host_permissions: ['<all_urls>'],
    // WebAssembly is only used by the PDF viewer's image decoders.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // The viewer must be reachable from a top-level navigation to a PDF.
    web_accessible_resources: [{ resources: ['pdf.html'], matches: ['<all_urls>'] }],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: '__MSG_extName__',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png' },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+N' },
      },
      'toggle-site': {
        description: '__MSG_cmdToggleSite__',
        suggested_key: { default: 'Alt+Shift+D' },
      },
      'toggle-global': {
        description: '__MSG_cmdToggleGlobal__',
        suggested_key: { default: 'Alt+Shift+A' },
      },
      'cycle-mode': {
        description: '__MSG_cmdCycleMode__',
        suggested_key: { default: 'Alt+Shift+C' },
      },
      // Chrome allows four suggested keys; this one is left for the user to assign.
      'pick-element': {
        description: '__MSG_cmdPickElement__',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'smart-dark-mode@nikhil914',
              // 140 = current ESR; also the first release with data_collection_permissions.
              strict_min_version: '140.0',
              // Zero telemetry: we collect nothing (F6).
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
});
