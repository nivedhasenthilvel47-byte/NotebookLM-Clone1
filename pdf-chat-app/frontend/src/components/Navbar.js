import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="container">
        <h1>PDF Chat</h1>
        <div>
          <Link to="/" className="nav-link">Upload</Link>
          <Link to="/chat" className="nav-link">Chat</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
