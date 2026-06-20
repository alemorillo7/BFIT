import React, { useState, useEffect } from 'react';
import { fetchSheetData, sendWebhookMutation } from '../services/dataService';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

const DataView = ({ title, sheetName, columns }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('create'); // 'create' or 'edit'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Para manejar sub-tablas
  const [activeSheet, setActiveSheet] = useState(sheetName);
  const [activeColumns, setActiveColumns] = useState(columns);

  useEffect(() => {
    loadData();
    setActiveSheet(sheetName);
    setActiveColumns(columns);
  }, [sheetName, columns]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchSheetData(sheetName);
      setData(result);
    } catch (error) {
      console.error(`Error loading data for ${sheetName}:`, error);
      alert(`Error al cargar datos de ${sheetName}. Revisa la consola.`);
    } finally {
      setLoading(false);
    }
  };

  const isMerienditas = sheetName === 'Merienditas';
  let mainData = data;
  let subData = [];
  
  const alternativasCols = [
    { key: 'id', label: 'ID' },
    { key: 'opcion', label: 'Opción' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'bebidas_disponibles', label: 'Bebidas Disponibles' }
  ];

  if (isMerienditas && data.length > 0) {
    let inSubTable = false;
    mainData = [];
    data.forEach(row => {
      if (row.semana === 'ALTERNATIVAS DE MERIENDITAS (solicitar con 1 día de anticipación)') {
        inSubTable = true;
        return;
      }
      if (row.semana === '#') return;
      
      if (inSubTable) {
        subData.push({
          id: row.semana || '',
          opcion: row.dia || '',
          descripcion: row.merienda || '',
          bebidas_disponibles: row.juguito || ''
        });
      } else {
        mainData.push(row);
      }
    });
  }

  const handleEdit = (row, targetSheet = sheetName, cols = columns) => {
    setModalType('edit');
    setSelectedRecord(row);
    setActiveSheet(targetSheet);
    setActiveColumns(cols);
    setIsModalOpen(true);
  };

  const handleCreate = (targetSheet = sheetName, cols = columns, currentData = mainData) => {
    setModalType('create');
    let prefill = null;
    
    // Lógica para auto-incrementar IDs si la tabla tiene una columna 'id'
    if (cols.some(c => c.key === 'id')) {
      const maxId = currentData.reduce((max, row) => {
        const rowId = parseInt(row.id);
        return !isNaN(rowId) && rowId > max ? rowId : max;
      }, 0);
      prefill = { id: (maxId + 1).toString() };
    }

    setSelectedRecord(prefill);
    setActiveSheet(targetSheet);
    setActiveColumns(cols);
    setIsModalOpen(true);
  };

  const handleDelete = async (row, targetSheet = sheetName) => {
    if (window.confirm('¿Estás seguro de eliminar este registro?')) {
      try {
        setLoading(true);
        await sendWebhookMutation(targetSheet, 'BAJA', row);
        alert('Registro eliminado. n8n procesará la baja.');
      } catch (err) {
        alert('Error al intentar eliminar el registro.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleModalSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const action = modalType === 'create' ? 'ALTA' : 'MODIFICACION';
      await sendWebhookMutation(activeSheet, action, formData);
      alert(`Operación exitosa: ${action}. n8n procesará los cambios en el sheet.`);
      setIsModalOpen(false);
    } catch (err) {
      alert('Error al guardar el registro. Intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <DataTable 
        title={title}
        data={mainData}
        columns={columns}
        isLoading={loading}
        onEdit={(row) => handleEdit(row, sheetName, columns)}
        onDelete={(row) => handleDelete(row, sheetName)}
        onCreate={() => handleCreate(sheetName, columns, mainData)}
      />

      {isMerienditas && (
        <div style={{ marginTop: '3rem' }}>
          <DataTable 
            title="Alternativas de Merienditas"
            data={subData}
            columns={alternativasCols}
            isLoading={loading}
            onEdit={(row) => handleEdit(row, 'Alternativas_Merienditas', alternativasCols)}
            onDelete={(row) => handleDelete(row, 'Alternativas_Merienditas')}
            onCreate={() => handleCreate('Alternativas_Merienditas', alternativasCols, subData)}
          />
        </div>
      )}

      <Modal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalType === 'create' ? `Nuevo Registro` : `Editar Registro`}
        columns={activeColumns}
        initialData={selectedRecord}
        onSubmit={handleModalSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default DataView;
