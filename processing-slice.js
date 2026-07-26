/* Generated from src/features/processing/processing-slice.ts for jsDelivr +esm — do not edit dist directly. */
import { createSlice } from 'https://cdn.jsdelivr.net/npm/@reduxjs/toolkit@2.11.0/+esm';
const initialState = {
    status: 'idle', source: null, messageIndex: null, messageKey: null,
    detail: null, error: null, lastCompletedAt: null,
};
const slice = createSlice({
    name: 'processing',
    initialState,
    reducers: {
        processRequested(_state, _action) { },
        started(state, action) {
            state.status = 'loading';
            state.source = action.payload.source;
            state.messageIndex = action.payload.messageIndex;
            state.messageKey = action.payload.messageKey;
            state.detail = '读取消息与阶段缓存';
            state.error = null;
        },
        stageChanged(state, action) {
            state.status = action.payload.stage;
            state.detail = action.payload.detail;
            state.error = null;
        },
        completed(state, action) {
            state.status = 'complete';
            state.detail = action.payload;
            state.error = null;
            state.lastCompletedAt = Date.now();
        },
        blocked(state, action) {
            state.status = 'blocked';
            state.detail = action.payload;
            state.error = null;
        },
        failed(state, action) {
            state.status = 'error';
            state.error = action.payload;
            state.detail = null;
        },
        reset(state) {
            Object.assign(state, initialState);
        },
    },
});
export const processingActions = slice.actions;
export const processingReducer = slice.reducer;
