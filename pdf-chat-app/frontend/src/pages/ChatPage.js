import React from 'react';
import PDFViewer from '../components/PDFViewer';
import Chat from '../components/Chat';

const ChatPage = () => {
  return (
    <div className="container chat-page">
      <div className="chat-split">
        <div className="left-panel">
          <PDFViewer />
        </div>
        <div className="right-panel">
          <Chat />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
