import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

const buildInitialData = (columns, initialData) => {
  if (initialData) {
    return initialData;
  }

  return columns.reduce((accumulator, column) => {
    accumulator[column.key] = '';
    return accumulator;
  }, {});
};

const ModalForm = ({ title, columns, initialData, onClose, onSubmit, isSubmitting }) => {
  const [formData, setFormData] = useState(() => buildInitialData(columns, initialData));

  const handleChange = (event, key) => {
    setFormData((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(formData);
  };

  return (
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
            {columns.map((col) => (
              <div key={col.key} className="form-group">
                <label className="label">{col.label}</label>
                {col.type === 'select' ? (
                  <select
                    className="input"
                    value={formData[col.key] || ''}
                    onChange={(event) => handleChange(event, col.key)}
                    disabled={isSubmitting}
                  >
                    {col.options.map((option) => (
                      <option key={option.value || 'empty'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input"
                    value={formData[col.key] || ''}
                    onChange={(event) => handleChange(event, col.key)}
                    placeholder={`Ingrese ${col.label.toLowerCase()}`}
                    disabled={isSubmitting}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, columns, initialData, onSubmit, isSubmitting }) => {
  const modalKey = useMemo(() => JSON.stringify({ initialData, columns: columns.map((column) => column.key) }), [columns, initialData]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <ModalForm
      key={modalKey}
      title={title}
      columns={columns}
      initialData={initialData}
      onClose={onClose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    />,
    document.body,
  );
};

export default Modal;
