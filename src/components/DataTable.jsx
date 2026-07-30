import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Edit2, GraduationCap, Plus, Search, Trash2 } from 'lucide-react';
import * as Papa from 'papaparse';
import './DataTable.css';

const getSelectModifier = (value) => String(value || '').trim().toLowerCase();

const DataTable = ({
  title,
  data,
  columns,
  onEdit,
  onDelete,
  onCreate,
  onPromote,
  onBulkPromote,
  onCellChange,
  isCellUpdating,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const sortedData = useMemo(() => {
    const sortableItems = [...data];

    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return sortableItems;
  }, [data, sortConfig]);

  const filteredData = useMemo(
    () =>
      sortedData.filter((item) =>
        Object.values(item).some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase())),
      ),
    [searchTerm, sortedData],
  );

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const exportToCSV = () => {
    const csv = Papa.unparse(filteredData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/\s+/g, '_')}_Export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="datatable-wrapper premium-card">
      <div className="datatable-header">
        <h3 className="datatable-title">{title}</h3>

        <div className="datatable-actions">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar..."
              className="input search-input"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <button className="btn btn-outline" onClick={exportToCSV}>
            <Download size={18} />
            <span className="hide-mobile">Exportar</span>
          </button>

          {onBulkPromote && (
            <button className="btn btn-primary" style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={onBulkPromote}>
              <GraduationCap size={18} />
              <span className="hide-mobile">Subir Todos de Curso</span>
            </button>
          )}

          {onCreate && (
            <button className="btn btn-primary" onClick={onCreate}>
              <Plus size={18} />
              <span className="hide-mobile">Nuevo Registro</span>
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading-state">Cargando datos...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} onClick={() => requestSort(col.key)} className="sortable-header">
                    <div className="th-content">
                      {col.label}
                      <ArrowUpDown size={14} className="sort-icon" />
                    </div>
                  </th>
                ))}
                {(onEdit || onDelete || onPromote) && <th className="actions-th">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedData.length > 0 ? (
                paginatedData.map((row, index) => (
                  <tr key={index}>
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.type === 'select' && onCellChange ? (
                          <select
                            className={`table-select color-select color-select--${getSelectModifier(row[col.key]) || 'empty'}`}
                            value={row[col.key] || ''}
                            onChange={(event) => onCellChange(row, col.key, event.target.value)}
                            disabled={isCellUpdating?.(row, col.key)}
                            aria-label={`${col.label} de ${row.nombre_hijo || 'registro'}`}
                          >
                            {col.options.map((option) => (
                              <option key={option.value || 'empty'} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : col.render ? (
                          col.render(row[col.key], row)
                        ) : (
                          row[col.key]
                        )}
                      </td>
                    ))}
                    {(onEdit || onDelete || onPromote) && (
                      <td className="actions-cell">
                        <div className="action-buttons">
                          {onPromote && (
                            <button
                              className="icon-btn"
                              style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }}
                              onClick={() => onPromote(row)}
                              title="Subir de Curso"
                            >
                              <GraduationCap size={16} />
                            </button>
                          )}
                          {onEdit && (
                            <button className="icon-btn edit-btn" onClick={() => onEdit(row)} title="Editar">
                              <Edit2 size={16} />
                            </button>
                          )}
                          {onDelete && (
                            <button className="icon-btn delete-btn" onClick={() => onDelete(row)} title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + (onEdit || onDelete || onPromote ? 1 : 0)} className="empty-state">
                    No se encontraron registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="datatable-footer">
        <span className="text-muted">
          Mostrando {filteredData.length === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + rowsPerPage, filteredData.length)} de {filteredData.length} registros
        </span>
        <div className="pagination-controls">
          <button className="icon-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1 || filteredData.length === 0}>
            <ChevronLeft size={18} />
          </button>
          <span className="page-info">Página {currentPage} de {totalPages || 1}</span>
          <button
            className="icon-btn"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages || filteredData.length === 0}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
