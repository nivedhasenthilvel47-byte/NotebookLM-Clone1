import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  id: null,
  name: null,
  url: null,
  currentPage: 1,
};

const pdfSlice = createSlice({
  name: 'pdf',
  initialState,
  reducers: {
    uploadPDF: (state, action) => {
      state.id = action.payload.id;
      state.name = action.payload.name;
      state.url = action.payload.url; // e.g., '/uploads/<file>'
      state.currentPage = 1;
    },
    setCurrentPage: (state, action) => {
      state.currentPage = action.payload;
    },
    resetPDF: () => initialState,
  },
});

export const { uploadPDF, setCurrentPage, resetPDF } = pdfSlice.actions;
export default pdfSlice.reducer;
