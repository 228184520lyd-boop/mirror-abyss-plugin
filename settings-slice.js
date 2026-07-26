/* Generated from src/features/settings/settings-slice.ts — do not edit dist directly. */
import { createSlice } from '../../vendor/redux-toolkit.js';
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
