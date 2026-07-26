/* Generated dependency shim for @reduxjs/toolkit. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("@reduxjs/toolkit", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/@reduxjs/toolkit@2.11.0?target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/@reduxjs/toolkit@2.11.0/+esm"
  }
]);
export const configureStore = module.configureStore;
export const createListenerMiddleware = module.createListenerMiddleware;
export const createSlice = module.createSlice;
