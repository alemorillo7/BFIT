import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();

    if (username === 'admin' && password === 'bfit2026') {
      onLogin();
      navigate('/padres-alumnos');
    } else {
      setError('Credenciales incorrectas. (admin / bfit2026)');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card premium-card">
        <div className="login-header">
          <h1 className="brand-title">
            <span className="brand-accent">B</span>fit
          </h1>
          <p>Bienvenido al Panel Administrativo</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label className="label">Usuario</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary login-btn">
            Ingresar al Sistema
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
