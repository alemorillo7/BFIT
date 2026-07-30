import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import './Layout.css';
import Sidebar from './Sidebar';

const Layout = ({ onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebarMobile = () => {
    setSidebarOpen((current) => !current);
  };

  const toggleSidebarDesktop = () => {
    setSidebarCollapsed((current) => !current);
  };

  return (
    <div className={`layout-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={toggleSidebarMobile} />

      <div className={`sidebar-wrapper ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <Sidebar
          isCollapsed={sidebarCollapsed}
          isOpen={sidebarOpen}
          onLogout={onLogout}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      <main className="main-content">
        <Header toggleSidebar={toggleSidebarMobile} toggleSidebarDesktop={toggleSidebarDesktop} isCollapsed={sidebarCollapsed} />
        <div className="content-area animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
