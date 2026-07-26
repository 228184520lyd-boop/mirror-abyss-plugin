/* Generated dependency shim for react. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("react", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/react@18.2.0?target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/react@18.2.0/+esm"
  }
]);
export default module.default ?? module;
