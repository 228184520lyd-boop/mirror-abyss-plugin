/* Generated from src/features/settings/settings-slice.ts for jsDelivr +esm — do not edit dist directly. */
import { createSlice } from 'https://cdn.jsdelivr.net/npm/@reduxjs/toolkit@2.11.0/+esm';
import { DEFAULT_SETTINGS } from '../../model/settings.js';
const slice = createSlice({
    name: 'settings',
    initialState: DEFAULT_SETTINGS,
    reducers: {
        loaded(_state, action) { return action.payload; },
        patchRequested(_state, _action) { },
        patched(state, action) {
            Object.assign(state, action.payload);
        },
    },
});
export const settingsActions = slice.actions;
export const settingsReducer = slice.reducer;
