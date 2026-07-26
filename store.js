/* Generated from src/app/store.ts — do not edit dist directly. */
import { configureStore, createListenerMiddleware } from '../vendor/redux-toolkit.js';
import { documentReducer } from '../features/document/document-slice.js';
import { processingReducer } from '../features/processing/processing-slice.js';
import { sessionReducer } from '../features/session/session-slice.js';
import { settingsReducer } from '../features/settings/settings-slice.js';
export function createApplicationStore() {
    const listenerMiddleware = createListenerMiddleware();
    const store = configureStore({
        reducer: { session: sessionReducer, document: documentReducer, processing: processingReducer, settings: settingsReducer },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: true, immutableCheck: true }).prepend(listenerMiddleware.middleware),
    });
    return { store, listenerMiddleware };
}
