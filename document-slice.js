/* Generated from src/features/document/document-slice.ts — do not edit dist directly. */
import { createSlice } from '../../vendor/redux-toolkit.js';
const initialState = {
    active: null,
};
const documentSlice = createSlice({
    name: 'document',
    initialState,
    reducers: {
        cleared(state) {
            state.active = null;
        },
        loaded(state, action) {
            state.active = action.payload;
        },
        /**
         * 后续业务只能在持久化成功后派发该动作。
         * 第一阶段不提供乐观更新入口。
         */
        committed(state, action) {
            state.active = action.payload;
        },
    },
});
export const documentActions = documentSlice.actions;
export const documentReducer = documentSlice.reducer;
