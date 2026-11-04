import { defineConfig } from 'wxt';

// One config, every target. Browser-specific manifest keys are added by `manifest()`.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'tabs', 'alarms'],
    host_permissions: ['<all_urls>'],
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
