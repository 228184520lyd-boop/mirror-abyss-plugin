/* Generated from src/features/session/session-slice.ts for esm.sh — do not edit dist directly. */
import { createSlice } from 'https://esm.sh/@reduxjs/toolkit@2.11.0?target=es2022';
const initialState = {
    activeChatKey: null,
    generation: 0,
    status: 'idle',
    error: null,
};
const sessionSlice = createSlice({
    name: 'session',
    initialState,
    reducers: {
        chatChanged(state, action) {
            state.activeChatKey = action.payload.chatKey;
            state.generation = action.payload.generation;
            state.status = action.payload.chatKey ? 'loading-chat' : 'idle';
            state.error = null;
        },
        ready(state) {
            state.status = 'ready';
            state.error = null;
        },
        failed(state, action) {
            state.status = 'error';
            state.error = action.payload;
        },
        disabled(state) {
            state.status = 'disabled';
            state.error = null;
        },
    },
});
export const sessionActions = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
