/* Generated dependency shim for react-redux. */
import { loadPinnedDependency } from './_load.js';
const module = await loadPinnedDependency("react-redux", [
  {
    "id": "esmsh",
    "label": "esm.sh",
    "url": "https://esm.sh/react-redux@9.2.0?deps=react@18.2.0,redux@5.0.1&target=es2022"
  },
  {
    "id": "jsdelivr",
    "label": "jsDelivr +esm",
    "url": "https://cdn.jsdelivr.net/npm/react-redux@9.2.0/+esm"
  }
]);
export const Provider = module.Provider;
export const useDispatch = module.useDispatch;
export const useSelector = module.useSelector;
