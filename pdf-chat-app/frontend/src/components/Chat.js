import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import './Chat.css';
import { setCurrentPage } from '../store/pdfSlice';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const pdfInfo = useSelector((state) => state.pdf);
  const dispatch = useDispatch();

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(`http://localhost:${process.env.PORT || 3001}`);
    setSocket(newSocket);

    newSocket.on('message', (message) => {
      setIsLoading(false);
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    // Send message to backend
    socket.emit('message', {
      text: inputMessage,
      pdfId: pdfInfo.id
    });

    // Add user message to chat
    setMessages((prev) => [...prev, { text: inputMessage, isUser: true }]);
    setInputMessage('');
    setIsLoading(true);
  };

  const handleCitationClick = (pageNumber) => {
    if (!pageNumber) return;
    dispatch(setCurrentPage(pageNumber));
    const el = document.getElementById('pdf-viewer');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat with your PDF</h2>
        <p>Ask questions about the document content</p>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <h3>Start the conversation</h3>
            <p>Ask questions about your PDF document</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.isUser ? 'user' : 'assistant'}`}
            >
              <div className="message-header">
                <span className="message-sender">
                  {message.isUser ? 'You' : 'AI Assistant'}
                </span>
                <span className="message-time">
                  {formatDate(new Date())}
                </span>
              </div>
              <div className="message-content">
                {message.isUser ? message.text : (
                  <>
                    <p>{message.text}</p>
                    {message.citations && message.citations.length > 0 && (
                      <div className="citations">
                        <div className="citations-label">Sources:</div>
                        <div className="citations-buttons">
                          {message.citations.map((citation, i) => (
                            <button
                              key={i}
                              onClick={() => handleCitationClick(citation.page)}
                              className="citation-button"
                            >
                              <span>📄</span> Page {citation.page}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span className="message-sender">AI Assistant</span>
              <span className="message-time">{formatDate(new Date())}</span>
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="chat-input">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask a question about your document..."
          disabled={!pdfInfo.id || isLoading}
        />
        <button 
          type="submit" 
          disabled={!inputMessage.trim() || !pdfInfo.id || isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
          {!isLoading && <span>→</span>}
        </button>
      </form>
    </div>
  );
};

export default Chat;
