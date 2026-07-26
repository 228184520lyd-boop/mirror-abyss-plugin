/* Generated dependency shim for react-dom/client. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("react-dom/client", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/react-dom@18.2.0/client?deps=react@18.2.0&target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/react-dom@18.2.0/client/+esm"
  }
]);
export const createRoot = module.createRoot;
