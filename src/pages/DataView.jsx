import React, { useState, useEffect } from 'react';
import { fetchSheetData, sendWebhookMutation } from '../services/dataService';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

// Caché global en memoria para carga instantánea al cambiar de pestañas
const sheetCache = {};

const courseProgression = [
  "1 PREK",
  "2 KINDER",
  "3 PRIMARIA 1",
  "3 PRIMARIA 2",
  "3 PRIMARIA 3",
  "3 PRIMARIA 4",
  "3 PRIMARIA 5",
  "3 PRIMARIA 6",
  "4 SECUNDARIA 1",
  "4 SECUNDARIA 2",
  "4 SECUNDARIA 3",
  "4 SECUNDARIA 4",
  "4 SECUNDARIA 5",
  "4 SECUNDARIA 6"
];

const promoteCourse = (currentCourse) => {
  if (!currentCourse) return currentCourse;
  
  // Función para normalizar quitando espacios y guiones para hacer la comparación a prueba de balas
  const normalize = (c) => c.replace(/[\s-]/g, '').toUpperCase();
  const normalizedCurrent = normalize(currentCourse);
  
  const index = courseProgression.findIndex(c => normalize(c) === normalizedCurrent);
  
  if (index >= 0 && index < courseProgression.length - 1) {
    const nextCourse = courseProgression[index + 1];
    if (nextCourse === "1 PREK") return "1 Pre K";
    if (nextCourse === "2 KINDER") return "2 Kinder";
    // Retornamos el formato Title Case (ej: 4 Secundaria 1)
    return nextCourse.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }
  return currentCourse; // Si ya está en 4 SECUNDARIA 6 o no se encuentra, no sube
};

const getCurrentWeekString = () => {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; 
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const format = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  return `${format(monday)} - ${format(friday)}`;
};

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
  const [subData, setSubData] = useState([]);

  const isMerienditas = sheetName === 'Merienditas';

  useEffect(() => {
    loadData();
    setActiveSheet(sheetName);
    setActiveColumns(columns);
  }, [sheetName, columns]);

  const loadData = async () => {
    // Si ya tenemos datos cacheados, los mostramos instantáneamente
    if (sheetCache[sheetName]) {
      setData(sheetCache[sheetName]);
      setLoading(false);
    } else {
      setLoading(true);
    }
    if (isMerienditas && sheetCache['Alternativa a merienditas']) {
      setSubData(sheetCache['Alternativa a merienditas']);
    }

    try {
      // De todas formas vamos a buscar a Google Sheets en el fondo (background)
      const result = await fetchSheetData(sheetName);
      sheetCache[sheetName] = result; 
      setData(result); 

      if (isMerienditas) {
        const subResult = await fetchSheetData('Alternativa a merienditas');
        sheetCache['Alternativa a merienditas'] = subResult;
        setSubData(subResult);
      }
    } catch (error) {
      console.error(`Error loading data:`, error);
      alert(`Error al cargar datos. Revisa la consola.`);
    } finally {
      setLoading(false);
    }
  };

  const alternativasCols = [
    { key: '#', label: 'ID' },
    { key: 'opcion', label: 'Opción' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'bebidas_disponibles', label: 'Bebidas Disponibles' }
  ];

  let mainData = data;

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
    
    // Lógica para auto-incrementar IDs si la tabla tiene una columna 'id' (case-insensitive) o '#'
    const idCol = cols.find(c => c.key.toLowerCase() === 'id' || c.key === '#');
    if (idCol) {
      const maxId = currentData.reduce((max, row) => {
        const rowId = parseInt(row[idCol.key]);
        return !isNaN(rowId) && rowId > max ? rowId : max;
      }, 0);
      prefill = { [idCol.key]: (maxId + 1).toString() };
    }

    if (cols.some(c => c.key === 'semana')) {
      if (!prefill) prefill = {};
      prefill.semana = getCurrentWeekString();
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
      setIsModalOpen(false);
      // Recargar datos en background
      loadData();
    } catch (err) {
      alert('Error al guardar el registro. Intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromote = async (row) => {
    const currentCourse = row.curso;
    const newCourse = promoteCourse(currentCourse);
    if (newCourse === currentCourse) {
      alert('Este alumno ya se encuentra en el último curso y no puede subir más.');
      return;
    }
    if (window.confirm(`¿Estás seguro que deseas subir a ${row.nombre_hijo} de ${currentCourse} a ${newCourse}?`)) {
      try {
        setLoading(true);
        const updatedRow = { ...row, curso: newCourse };
        await sendWebhookMutation('Padres_Alumnos', 'MODIFICACION', updatedRow);
        // Actualizamos estado local rápido
        const updatedData = data.map(d => d === row ? updatedRow : d);
        setData(updatedData);
        sheetCache[sheetName] = updatedData;
      } catch (err) {
        alert('Error al intentar subir de curso al alumno.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkPromote = async () => {
    if (window.confirm('⚠️ ATENCIÓN: ¿Estás seguro de que deseas enviar la orden masiva para subir a TODOS los alumnos de grado? Esta acción enviará una señal a la base de datos para que todos avancen al siguiente curso.')) {
      try {
        setLoading(true);
        // Se envía una señal especial de subida masiva a n8n
        await sendWebhookMutation('Padres_Alumnos', 'SUBIR_CURSO_MASIVO', {});
        alert('Se ha enviado la orden de subida masiva con éxito.');
        loadData();
      } catch (err) {
        alert('Error al enviar la orden masiva.');
      } finally {
        setLoading(false);
      }
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
        onPromote={sheetName === 'Padres_Alumnos' ? handlePromote : undefined}
        onBulkPromote={sheetName === 'Padres_Alumnos' ? handleBulkPromote : undefined}
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
