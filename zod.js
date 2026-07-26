/* Generated dependency shim for zod. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("zod", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/zod@4.4.3?target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/zod@4.4.3/+esm"
  }
]);
export const z = module.z;
