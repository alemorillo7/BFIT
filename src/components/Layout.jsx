import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

const Layout = ({ onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Nuevo estado

  const toggleSidebarMobile = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleSidebarDesktop = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className={`layout-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={toggleSidebarMobile}></div>
      
      <div className={`sidebar-wrapper ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <Sidebar isCollapsed={sidebarCollapsed} isOpen={sidebarOpen} onLogout={onLogout} />
      </div>

      <main className="main-content">
        <Header 
          toggleSidebar={toggleSidebarMobile} 
          toggleSidebarDesktop={toggleSidebarDesktop} 
          isCollapsed={sidebarCollapsed} 
        />
        <div className="content-area animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
