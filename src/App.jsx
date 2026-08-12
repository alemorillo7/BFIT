import { useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AgentPanel from './pages/AgentPanel';
import DataView from './pages/DataView';
import Login from './pages/Login';

const formatSheetDate = (value) => {
  const rawValue = String(value || '').trim();
  const isoDate = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!isoDate) {
    return rawValue || 'Sin fecha';
  }

  const [, year, month, day] = isoDate;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '');
};

const formatSheetTime = (value) => {
  const rawValue = String(value || '').trim();
  const time = rawValue.match(/(?:^|T)(\d{1,2}):(\d{2})/);

  return time ? `${time[1].padStart(2, '0')}:${time[2]} hs` : rawValue || 'Sin hora';
};

const renderDate = (value) => (
  <time className="sheet-date" dateTime={String(value || '')} title={String(value || '')}>
    {formatSheetDate(value)}
  </time>
);

const renderTime = (value) => (
  <time className="sheet-time" title={String(value || '')}>
    {formatSheetTime(value)}
  </time>
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('bfit_auth') === 'true');

  const handleLogin = () => {
    localStorage.setItem('bfit_auth', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('bfit_auth');
    setIsAuthenticated(false);
  };

  const padresAlumnosCols = [
    { key: 'nombre_mama', label: 'Nombre Madre' },
    { key: 'telefono_wa_mama', label: 'Tel. Madre' },
    { key: 'nombre_papa', label: 'Nombre Padre' },
    { key: 'telefono_wa_papa', label: 'Tel. Padre' },
    { key: 'nombre_hijo', label: 'Nombre Alumno' },
    { key: 'curso', label: 'Curso' },
    { key: 'tipo_menu', label: 'Tipo Menú' },
    { key: 'tipo_pago', label: 'Tipo Pago' },
    {
      key: 'saldo_bs',
      label: 'Saldo',
      render: (val) => <span className={`font-medium ${parseFloat(val) < 0 ? 'text-danger' : 'text-success'}`}>{val} Bs</span>,
    },
    {
      key: 'activo',
      label: 'Estado',
      render: (val) => <span className={`badge ${val === 'TRUE' || val === 'Activo' ? 'badge-success' : 'badge-danger'}`}>{val === 'TRUE' ? 'Activo' : 'Inactivo'}</span>,
    },
    { key: 'observaciones', label: 'Observaciones' },
    { key: 'Registrado IA', label: 'Reg. IA' },
    { key: 'Ultima fecha de pago ', label: 'Últ. Pago' },
    {
      key: 'Consume merienda?',
      label: 'Consume merienda',
      type: 'select',
      options: [
        { value: '', label: 'No' },
        { value: 'Si', label: 'Sí' },
      ],
    },
    {
      key: 'Color',
      label: 'Color',
      type: 'select',
      options: [
        { value: '', label: 'Sin color' },
        { value: 'Verde', label: 'Verde' },
        { value: 'Azul', label: 'Azul' },
        { value: 'Amarillo', label: 'Amarillo' },
        { value: 'Naranja', label: 'Naranja' },
      ],
    },
  ];

  const menuTradicionalCols = [
    { key: 'ID', label: 'ID' },
    { key: 'semana', label: 'Semana' },
    { key: 'dia', label: 'Día' },
    { key: 'sopa', label: 'Sopa' },
    { key: 'segundo', label: 'Segundo' },
    { key: 'guarnicion', label: 'Guarnición' },
    { key: 'postre', label: 'Postre' },
    { key: 'bebida_nota', label: 'Bebida / Nota' },
  ];

  const menuFitCols = [
    { key: 'ID', label: 'ID' },
    { key: 'semana', label: 'Semana' },
    { key: 'dia', label: 'Día' },
    { key: 'segundo', label: 'Segundo' },
    { key: 'guarnicion', label: 'Guarnición' },
    { key: 'postre', label: 'Postre' },
    { key: 'bebida_nota', label: 'Bebida / Nota' },
  ];

  const merienditasCols = [
    { key: 'ID', label: 'ID' },
    { key: 'semana', label: 'Semana' },
    { key: 'dia', label: 'Día' },
    { key: 'merienda', label: 'Merienda' },
    { key: 'juguito', label: 'Juguito' },
  ];

  const platosAlternativosCols = [
    { key: 'id', label: 'ID' },
    { key: 'nombre', label: 'Nombre' },
    { key: 'descripcion_completa', label: 'Descripción Completa' },
  ];

  const configCols = [
    { key: 'variable', label: 'Variable' },
    { key: 'valor', label: 'Valor' },
    { key: 'descripcion', label: 'Descripción' },
  ];

  const cambiosCols = [
    { key: 'fecha', label: 'Fecha', render: renderDate },
    { key: 'nombre_padre', label: 'Nombre Padre' },
    { key: 'nombre_hijo', label: 'Nombre Hijo' },
    { key: 'curso', label: 'Curso' },
    { key: 'plato_original', label: 'Plato Original' },
    { key: 'plato_elegido', label: 'Plato Elegido' },
    { key: 'hora_registro', label: 'Hora Registro', render: renderTime },
  ];

  const observacionesCols = [
    { key: 'alumno', label: 'Alumno' },
    { key: 'fecha', label: 'Fecha', render: renderDate },
    {
      key: 'motivo_de_falta',
      label: 'Motivo de Falta',
      render: (value) => <span className="observation-reason">{value || 'Sin motivo informado'}</span>,
    },
    { key: 'hora_registro', label: 'Hora Registro', render: renderTime },
  ];

  const clientesPrefCols = [
    { key: 'ID', label: 'ID', readOnly: true },
    { key: 'telefono (sin el +)', label: 'Teléfono' },
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'Detalle',
      label: 'Detalle',
      type: 'textarea',
      fullWidth: true,
      render: (value) => (
        <span className={`client-detail ${value ? '' : 'client-detail--empty'}`}>
          {value || 'Sin detalle'}
        </span>
      ),
    },
    { key: 'Alumnos', label: 'Alumno(s)', formHidden: true },
  ];

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login onLogin={handleLogin} /> : <Navigate to="/padres-alumnos" />} />

        <Route path="/" element={isAuthenticated ? <Layout onLogout={handleLogout} /> : <Navigate to="/login" />}>
          <Route index element={<Navigate to="/padres-alumnos" />} />
          <Route path="padres-alumnos" element={<DataView title="Padres / Alumnos" sheetName="Padres_Alumnos" columns={padresAlumnosCols} />} />
          <Route path="menu-tradicional" element={<DataView title="Menú Tradicional" sheetName="Menu_Tradicional" columns={menuTradicionalCols} />} />
          <Route path="menu-fit" element={<DataView title="Menú Fit" sheetName="Menu_Fit" columns={menuFitCols} />} />
          <Route path="merienditas" element={<DataView title="Merienditas" sheetName="Merienditas" columns={merienditasCols} />} />
          <Route path="platos-alternativos" element={<DataView title="Platos Alternativos" sheetName="Platos_Alternativos" columns={platosAlternativosCols} />} />
          <Route path="registros-cambios" element={<DataView title="Registros de Cambios" sheetName="Registros_Cambios" columns={cambiosCols} />} />
          <Route path="observaciones" element={<DataView title="Observaciones Generales" sheetName="Observaciones" columns={observacionesCols} />} />
          <Route path="clientes-preferenciales" element={<DataView title="Clientes Preferenciales" sheetName="Clientes Preferenciales" columns={clientesPrefCols} />} />
          <Route path="config" element={<DataView title="Configuración" sheetName="Config" columns={configCols} />} />
          <Route path="agente-conversaciones" element={<AgentPanel section="conversations" />} />
          <Route path="agente-contactos" element={<AgentPanel section="contacts" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
