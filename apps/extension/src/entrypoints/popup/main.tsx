import { render } from 'preact';
import { applyDocumentLocale } from '@/lib/i18n';
import { App } from './App';

applyDocumentLocale();
const root = document.getElementById('app');
if (root) render(<App />, root);
