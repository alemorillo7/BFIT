import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import './Header.css';

const TITLE_BY_PATH = {
  '/': 'Planilla de Cobros',
  '/cobros': 'Planilla de Cobros',
  '/padres-alumnos': 'Padres / Alumnos',
  '/menu-tradicional': 'Menú Tradicional',
  '/menu-fit': 'Menú Fit',
  '/merienditas': 'Merienditas',
  '/platos-alternativos': 'Platos Alternativos',
  '/registros-cambios': 'Registros de Cambios',
  '/observaciones': 'Observaciones',
  '/clientes-preferenciales': 'Clientes Preferenciales',
  '/config': 'Configuración',
  '/agente-conversaciones': 'Agente: Conversaciones',
  '/agente-contactos': 'Agente: Contactos',
};

const Header = ({ toggleSidebar, toggleSidebarDesktop }) => {
  const location = useLocation();
  const pageTitle = TITLE_BY_PATH[location.pathname] || 'Dashboard';

  return (
    <header className="header glass">
      <div className="header-left">
        <button className="menu-btn mobile-toggle" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <button className="menu-btn desktop-toggle" onClick={toggleSidebarDesktop}>
          <Menu size={24} />
        </button>
        <h2 className="page-title">{pageTitle}</h2>
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
