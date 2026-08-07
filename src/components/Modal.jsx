import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
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

const normalizeSearchText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const ModalForm = ({ title, columns, initialData, onClose, onSubmit, isSubmitting, studentSearch }) => {
  const [formData, setFormData] = useState(() => buildInitialData(columns, initialData));
  const [studentQuery, setStudentQuery] = useState('');
  const [isStudentResultsOpen, setIsStudentResultsOpen] = useState(false);

  const filteredStudents = useMemo(() => {
    if (!studentSearch || !studentQuery.trim()) {
      return [];
    }

    const normalizedQuery = normalizeSearchText(studentQuery);

    return studentSearch.options
      .filter((student) => normalizeSearchText(student[studentSearch.childKey]).includes(normalizedQuery));
  }, [studentQuery, studentSearch]);

  const handleChange = (event, key) => {
    setFormData((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const submittedData = { ...formData };
    columns.filter((column) => column.formHidden).forEach((column) => delete submittedData[column.key]);
    onSubmit(submittedData);
  };

  const handleStudentSelect = (student) => {
    setStudentQuery(student[studentSearch.childKey] || '');
    setFormData((current) => ({
      ...current,
      ...studentSearch.onSelect(student),
    }));
    setIsStudentResultsOpen(false);
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
            {studentSearch && (
              <div className="form-group student-search-group">
                <label className="label" htmlFor="preferred-student-search">Buscar por hijo</label>
                <div className="student-search-control">
                  <Search className="student-search-icon" size={18} aria-hidden="true" />
                  <input
                    id="preferred-student-search"
                    type="search"
                    className="input student-search-input"
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setIsStudentResultsOpen(true);
                    }}
                    onFocus={() => setIsStudentResultsOpen(true)}
                    placeholder="Escriba el nombre del alumno"
                    autoComplete="off"
                    disabled={isSubmitting || studentSearch.isLoading}
                  />

                  {isStudentResultsOpen && studentQuery.trim() && (
                    <div className="student-search-results">
                      {studentSearch.isLoading ? (
                        <p className="student-search-message">Cargando alumnos...</p>
                      ) : filteredStudents.length > 0 ? (
                        filteredStudents.map((student, index) => (
                          <button
                            key={`${student[studentSearch.childKey]}-${student[studentSearch.courseKey]}-${index}`}
                            type="button"
                            className="student-search-result"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleStudentSelect(student)}
                          >
                            <span>{student[studentSearch.childKey]}</span>
                            {student[studentSearch.courseKey] && <small>{student[studentSearch.courseKey]}</small>}
                          </button>
                        ))
                      ) : (
                        <p className="student-search-message">No se encontraron alumnos.</p>
                      )}
                    </div>
                  )}
                </div>
                <small className="form-help">Al seleccionar un alumno se completan los datos de la madre.</small>
              </div>
            )}

            {columns.filter((col) => !col.formHidden).map((col) => (
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
                    disabled={isSubmitting || col.readOnly}
                    readOnly={col.readOnly}
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

const Modal = ({ isOpen, onClose, title, columns, initialData, onSubmit, isSubmitting, studentSearch }) => {
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
      studentSearch={studentSearch}
    />,
    document.body,
  );
};

export default Modal;
