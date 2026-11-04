import { render } from 'preact';
import { applyDocumentLocale } from '@/lib/i18n';
import { App } from './App';

applyDocumentLocale();
document.title = browser.i18n.getMessage('optionsTitle') || document.title;
const root = document.getElementById('app');
if (root) render(<App />, root);
