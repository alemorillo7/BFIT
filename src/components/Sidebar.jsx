import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Users, 
  Utensils, 
  Leaf, 
  Coffee, 
  ListPlus, 
  History, 
  MessageSquare, 
  Star,
  Settings,
  LogOut,
  Bot
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isCollapsed, isOpen, onLogout }) => {
  const menuItems = [
    { name: 'Padres / Alumnos', path: '/padres-alumnos', icon: <Users size={20} /> },
    { name: 'Menu Tradicional', path: '/menu-tradicional', icon: <Utensils size={20} /> },
    { name: 'Menu Fit', path: '/menu-fit', icon: <Leaf size={20} /> },
    { name: 'Merienditas', path: '/merienditas', icon: <Coffee size={20} /> },
    { name: 'Platos Alternativos', path: '/platos-alternativos', icon: <ListPlus size={20} /> },
    { name: 'Registros Cambios', path: '/registros-cambios', icon: <History size={20} /> },
    { name: 'Observaciones', path: '/observaciones', icon: <MessageSquare size={20} /> },
    { name: 'Clientes Preferenciales', path: '/clientes-preferenciales', icon: <Star size={20} /> },
    { name: 'Configuración', path: '/config', icon: <Settings size={20} /> },
    { name: 'Panel de Agente', path: 'https://app.chatwoot.com/app/accounts/156508/conversations/11', icon: <Bot size={20} />, isExternal: true },
  ];

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="brand-title">
          <span className="brand-accent">B</span>{!isCollapsed && 'fit'}
        </h2>
        {!isCollapsed && <p className="brand-subtitle">Panel Administrativo</p>}
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          if (item.isExternal) {
            return (
              <a 
                key={item.path} 
                href={item.path} 
                target="_blank" 
                rel="noopener noreferrer"
                className="nav-item"
                title={isCollapsed ? item.name : undefined}
                style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}
              >
                {item.icon}
                {!isCollapsed && <span>{item.name}</span>}
              </a>
            );
          }
          return (
            <NavLink 
              key={item.path} 
              to={item.path} 
              className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
              title={isCollapsed ? item.name : undefined}
            >
              {item.icon}
              {!isCollapsed && <span>{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>
      
      <div className="sidebar-footer">
        {!isCollapsed && <p className="footer-copy">© 2026 Bfit System</p>}
        <button className="sidebar-logout-btn" onClick={onLogout} title="Cerrar Sesión">
          <LogOut size={20} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
