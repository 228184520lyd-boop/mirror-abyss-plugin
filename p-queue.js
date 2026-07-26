/* Generated dependency shim for p-queue. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("p-queue", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/p-queue@9.3.1?target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/p-queue@9.3.1/+esm"
  }
]);
export default module.default ?? module;
