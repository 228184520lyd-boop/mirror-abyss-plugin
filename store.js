/* Generated from src/app/store.ts for esm.sh — do not edit dist directly. */
import { configureStore, createListenerMiddleware } from 'https://esm.sh/@reduxjs/toolkit@2.11.0?target=es2022';
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
