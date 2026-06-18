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

  useEffect(() => {
    loadData();
  }, [sheetName]);

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

  const handleEdit = (row) => {
    setModalType('edit');
    setSelectedRecord(row);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setModalType('create');
    setSelectedRecord(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (row) => {
    if (window.confirm('¿Estás seguro de eliminar este registro?')) {
      try {
        setLoading(true);
        await sendWebhookMutation(sheetName, 'BAJA', row);
        alert('Registro eliminado. n8n procesará la baja.');
        // Opcional: Recargar los datos después de un tiempo o asumiendo el cambio
        // await loadData();
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
      await sendWebhookMutation(sheetName, action, formData);
      alert(`Operación exitosa: ${action}. n8n procesará los cambios en el sheet.`);
      setIsModalOpen(false);
      // Opcional: Recargar los datos o agregarlos localmente para respuesta rápida
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
        data={data}
        columns={columns}
        isLoading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />

      <Modal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalType === 'create' ? `Nuevo Registro: ${title}` : `Editar Registro: ${title}`}
        columns={columns}
        initialData={selectedRecord}
        onSubmit={handleModalSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default DataView;
