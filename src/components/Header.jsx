import React from 'react';
import { Menu, LogOut, User } from 'lucide-react';
import './Header.css';

const Header = ({ toggleSidebar, toggleSidebarDesktop, isCollapsed, onLogout }) => {
  return (
    <header className="header glass">
      <div className="header-left">
        <button className="menu-btn mobile-toggle" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <button className="menu-btn desktop-toggle" onClick={toggleSidebarDesktop}>
          <Menu size={24} />
        </button>
        <h2 className="page-title">Dashboard</h2>
      </div>
      
      <div className="header-right">
        <div className="user-info">
          <span className="user-name">Administrador</span>
          <span className="user-role">Bfit System</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
