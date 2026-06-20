import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

const Modal = ({ isOpen, onClose, title, columns, initialData, onSubmit, isSubmitting }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        // Inicializar con campos vacíos
        const emptyData = {};
        columns.forEach(col => {
          emptyData[col.key] = '';
        });
        setFormData(emptyData);
      }
    }
  }, [isOpen, initialData, columns]);

  if (!isOpen) return null;

  const handleChange = (e, key) => {
    setFormData({
      ...formData,
      [key]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const modalContent = (
    <div className="modal-overlay">
      <div className="modal-content premium-card animate-fade-in">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            {columns.map(col => (
              <div key={col.key} className="form-group">
                <label className="label">{col.label}</label>
                <input
                  type="text"
                  className="input"
                  value={formData[col.key] || ''}
                  onChange={(e) => handleChange(e, col.key)}
                  placeholder={`Ingrese ${col.label.toLowerCase()}`}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
          
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
