# Third-party notices

The extension package bundles the following software. Their licence files ship inside the
package under `pdfjs/`.

| Component                                                  | Version                 | Licence                                 | Used for                                                                                                             |
| ---------------------------------------------------------- | ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 5.7.284                 | Apache-2.0                              | PDF viewer: rendering, text layer, standard fonts. The viewer's text-layer CSS is adapted from `web/pdf_viewer.css`. |
| OpenJPEG (WebAssembly build from pdf.js)                   | bundled with pdfjs-dist | BSD-2-Clause (`pdfjs/LICENSE_OPENJPEG`) | JPEG 2000 images in PDFs                                                                                             |
| PDFium JBIG2 decoder (WebAssembly build from pdf.js)       | bundled with pdfjs-dist | BSD-3-Clause (`pdfjs/LICENSE_JBIG2`)    | JBIG2 images in scanned PDFs                                                                                         |
| [Preact](https://preactjs.com)                             | 10.29.8                 | MIT                                     | Popup and options UI                                                                                                 |

The quality harness (not shipped) uses Playwright (Apache-2.0) and Dark Reader 4.9.134
(MIT) for comparison only.
