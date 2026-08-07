import { useCallback, useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { fetchSheetData, sendWebhookMutation } from '../services/dataService';

const sheetCache = {};
const PREFERRED_PHONE_KEY = 'telefono (sin el +)';

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const phonesMatch = (firstPhone, secondPhone) => {
  const first = normalizePhone(firstPhone);
  const second = normalizePhone(secondPhone);

  if (!first || !second) {
    return false;
  }

  return first === second || (first.length >= 8 && second.length >= 8 && first.slice(-8) === second.slice(-8));
};

const courseProgression = [
  '1 PREK',
  '2 KINDER',
  '3 PRIMARIA 1',
  '3 PRIMARIA 2',
  '3 PRIMARIA 3',
  '3 PRIMARIA 4',
  '3 PRIMARIA 5',
  '3 PRIMARIA 6',
  '4 SECUNDARIA 1',
  '4 SECUNDARIA 2',
  '4 SECUNDARIA 3',
  '4 SECUNDARIA 4',
  '4 SECUNDARIA 5',
  '4 SECUNDARIA 6',
];

const promoteCourse = (currentCourse) => {
  if (!currentCourse) {
    return currentCourse;
  }

  const normalize = (course) => course.replace(/[\s-]/g, '').toUpperCase();
  const normalizedCurrent = normalize(currentCourse);
  const index = courseProgression.findIndex((course) => normalize(course) === normalizedCurrent);

  if (index >= 0 && index < courseProgression.length - 1) {
    const nextCourse = courseProgression[index + 1];
    if (nextCourse === '1 PREK') {
      return '1 Pre K';
    }
    if (nextCourse === '2 KINDER') {
      return '2 Kinder';
    }

    return nextCourse.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
  }

  return currentCourse;
};

const getCurrentWeekString = () => {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const format = (date) => `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  return `${format(monday)} - ${format(friday)}`;
};

const alternativasCols = [
  { key: '#', label: 'ID' },
  { key: 'opcion', label: 'Opción' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'bebidas_disponibles', label: 'Bebidas Disponibles' },
];

const DataView = ({ title, sheetName, columns }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('create');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalSheet, setModalSheet] = useState(sheetName);
  const [modalColumns, setModalColumns] = useState(columns);
  const [subData, setSubData] = useState([]);
  const [updatingCells, setUpdatingCells] = useState(() => new Set());
  const [preferredStudents, setPreferredStudents] = useState([]);
  const [preferredStudentsLoading, setPreferredStudentsLoading] = useState(false);
  const [preferredClients, setPreferredClients] = useState([]);
  const [preferredClientsLoading, setPreferredClientsLoading] = useState(false);

  const isMerienditas = sheetName === 'Merienditas';
  const isPadresAlumnos = sheetName === 'Padres_Alumnos';
  const isClientesPreferenciales = sheetName === 'Clientes Preferenciales';

  const loadData = useCallback(async () => {
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
      const result = await fetchSheetData(sheetName);
      sheetCache[sheetName] = result;
      setData(result);

      if (isMerienditas) {
        const subResult = await fetchSheetData('Alternativa a merienditas');
        sheetCache['Alternativa a merienditas'] = subResult;
        setSubData(subResult);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error al cargar datos. Revisa la consola.');
    } finally {
      setLoading(false);
    }
  }, [isMerienditas, sheetName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!isClientesPreferenciales) {
      return undefined;
    }

    let cancelled = false;

    const loadPreferredStudents = async () => {
      if (sheetCache.Padres_Alumnos) {
        setPreferredStudents(sheetCache.Padres_Alumnos);
        return;
      }

      setPreferredStudentsLoading(true);

      try {
        const result = await fetchSheetData('Padres_Alumnos');
        sheetCache.Padres_Alumnos = result;

        if (!cancelled) {
          setPreferredStudents(result);
        }
      } catch (error) {
        console.error('Error loading students for preferred clients:', error);
      } finally {
        if (!cancelled) {
          setPreferredStudentsLoading(false);
        }
      }
    };

    loadPreferredStudents();

    return () => {
      cancelled = true;
    };
  }, [isClientesPreferenciales]);

  useEffect(() => {
    if (!isPadresAlumnos) {
      return undefined;
    }

    let cancelled = false;

    const loadPreferredClients = async () => {
      if (sheetCache['Clientes Preferenciales']) {
        setPreferredClients(sheetCache['Clientes Preferenciales']);
        return;
      }

      setPreferredClientsLoading(true);

      try {
        const result = await fetchSheetData('Clientes Preferenciales');
        sheetCache['Clientes Preferenciales'] = result;

        if (!cancelled) {
          setPreferredClients(result);
        }
      } catch (error) {
        console.error('Error loading preferred clients for students:', error);
      } finally {
        if (!cancelled) {
          setPreferredClientsLoading(false);
        }
      }
    };

    loadPreferredClients();

    return () => {
      cancelled = true;
    };
  }, [isPadresAlumnos]);

  const mainData = useMemo(() => {
    if (!isClientesPreferenciales) {
      return data;
    }

    return data.map((preferredClient) => {
      const studentNames = preferredStudents
        .filter(
          (student) =>
            phonesMatch(preferredClient[PREFERRED_PHONE_KEY], student.telefono_wa_mama) ||
            phonesMatch(preferredClient[PREFERRED_PHONE_KEY], student.telefono_wa_papa),
        )
        .map((student) => student.nombre_hijo)
        .filter(Boolean);

      return {
        ...preferredClient,
        Alumnos: [...new Set(studentNames)].join(', '),
      };
    });
  }, [data, isClientesPreferenciales, preferredStudents]);

  const isSameRecord = (item, row, targetSheet) => {
    if (targetSheet !== 'Clientes Preferenciales') {
      return item === row;
    }

    if (item.ID && row.ID) {
      return String(item.ID) === String(row.ID);
    }

    return phonesMatch(item[PREFERRED_PHONE_KEY], row[PREFERRED_PHONE_KEY]);
  };

  const withoutDerivedFields = (row) => {
    const cleanRow = { ...row };
    delete cleanRow.Alumnos;
    return cleanRow;
  };

  const handleEdit = (row, targetSheet = sheetName, cols = columns) => {
    setModalType('edit');
    setSelectedRecord(row);
    setModalSheet(targetSheet);
    setModalColumns(cols);
    setIsModalOpen(true);
  };

  const handleCreate = (targetSheet = sheetName, cols = columns, currentData = mainData) => {
    setModalType('create');

    let prefill = null;
    const idCol = cols.find((column) => column.key.toLowerCase() === 'id' || column.key === '#');

    if (idCol) {
      const maxId = currentData.reduce((max, row) => {
        const rowId = parseInt(row[idCol.key], 10);
        return !Number.isNaN(rowId) && rowId > max ? rowId : max;
      }, 0);

      prefill = { [idCol.key]: String(maxId + 1) };
    }

    if (cols.some((column) => column.key === 'semana')) {
      prefill = { ...(prefill || {}), semana: getCurrentWeekString() };
    }

    setSelectedRecord(prefill);
    setModalSheet(targetSheet);
    setModalColumns(cols);
    setIsModalOpen(true);
  };

  const handleDelete = async (row, targetSheet = sheetName) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro?')) {
      return;
    }

    try {
      setLoading(true);
      await sendWebhookMutation(targetSheet, 'BAJA', withoutDerivedFields(row));

      if (targetSheet === sheetName) {
        const updatedData = data.filter((item) => !isSameRecord(item, row, targetSheet));
        setData(updatedData);
        sheetCache[sheetName] = updatedData;
      } else if (targetSheet === 'Alternativas_Merienditas') {
        const updatedSubData = subData.filter((item) => item !== row);
        setSubData(updatedSubData);
        sheetCache['Alternativa a merienditas'] = updatedSubData;
      }
    } catch {
      alert('Error al intentar eliminar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleModalSubmit = async (formData) => {
    setIsSubmitting(true);

    try {
      const action = modalType === 'create' ? 'ALTA' : 'MODIFICACION';
      await sendWebhookMutation(modalSheet || sheetName, action, formData);
      setIsModalOpen(false);

      if ((modalSheet || sheetName) === sheetName) {
        const updatedData =
          modalType === 'create'
            ? [...data, formData]
            : data.map((item) => (isSameRecord(item, selectedRecord, modalSheet || sheetName) ? formData : item));
        setData(updatedData);
        sheetCache[sheetName] = updatedData;
      } else if ((modalSheet || sheetName) === 'Alternativas_Merienditas') {
        const updatedSubData =
          modalType === 'create' ? [...subData, formData] : subData.map((item) => (item === selectedRecord ? formData : item));
        setSubData(updatedSubData);
        sheetCache['Alternativa a merienditas'] = updatedSubData;
      }
    } catch {
      alert('Error al guardar el registro. Intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCellKey = (row, key) =>
    `${row.telefono_wa_mama || ''}|${row.telefono_wa_papa || ''}|${row.nombre_hijo || ''}|${key}`;

  const isPreferredClient = (row) =>
    preferredClients.some((client) => phonesMatch(client[PREFERRED_PHONE_KEY], row.telefono_wa_mama));

  const handleTogglePreferred = async (row) => {
    const phone = normalizePhone(row.telefono_wa_mama);

    if (!phone) {
      alert('Este alumno no tiene teléfono de madre cargado. Agregalo antes de marcarlo como preferencial.');
      return;
    }

    const cellKey = getCellKey(row, 'Preferencial');
    const matchingClients = preferredClients.filter((client) => phonesMatch(client[PREFERRED_PHONE_KEY], phone));
    setUpdatingCells((current) => new Set(current).add(cellKey));

    try {
      let updatedPreferredClients;

      if (matchingClients.length > 0) {
        await Promise.all(
          matchingClients.map((client) =>
            sendWebhookMutation('Clientes Preferenciales', 'BAJA', withoutDerivedFields(client)),
          ),
        );
        updatedPreferredClients = preferredClients.filter(
          (client) => !phonesMatch(client[PREFERRED_PHONE_KEY], phone),
        );
      } else {
        const maxId = preferredClients.reduce((max, client) => {
          const clientId = parseInt(client.ID, 10);
          return !Number.isNaN(clientId) && clientId > max ? clientId : max;
        }, 0);
        const newPreferredClient = {
          ID: String(maxId + 1),
          [PREFERRED_PHONE_KEY]: phone,
          nombre: row.nombre_mama || '',
        };

        await sendWebhookMutation('Clientes Preferenciales', 'ALTA', newPreferredClient);
        updatedPreferredClients = [...preferredClients, newPreferredClient];
      }

      setPreferredClients(updatedPreferredClients);
      sheetCache['Clientes Preferenciales'] = updatedPreferredClients;
    } catch {
      alert('Error al actualizar Clientes Preferenciales. Intente nuevamente.');
    } finally {
      setUpdatingCells((current) => {
        const next = new Set(current);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleCellChange = async (row, key, value) => {
    const cellKey = getCellKey(row, key);
    const updatedRow = { ...row, [key]: value };

    setUpdatingCells((current) => new Set(current).add(cellKey));

    try {
      await sendWebhookMutation(sheetName, 'MODIFICACION', updatedRow);
      const updatedData = data.map((item) => (item === row ? updatedRow : item));
      setData(updatedData);
      sheetCache[sheetName] = updatedData;
    } catch {
      alert('Error al guardar el color. Intente nuevamente.');
    } finally {
      setUpdatingCells((current) => {
        const next = new Set(current);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handlePromote = async (row) => {
    const currentCourse = row.curso;
    const newCourse = promoteCourse(currentCourse);

    if (newCourse === currentCourse) {
      alert('Este alumno ya se encuentra en el último curso y no puede subir más.');
      return;
    }

    if (!window.confirm(`¿Estás seguro que deseas subir a ${row.nombre_hijo} de ${currentCourse} a ${newCourse}?`)) {
      return;
    }

    try {
      setLoading(true);
      const updatedRow = { ...row, curso: newCourse };
      await sendWebhookMutation('Padres_Alumnos', 'MODIFICACION', updatedRow);
      const updatedData = data.map((item) => (item === row ? updatedRow : item));
      setData(updatedData);
      sheetCache[sheetName] = updatedData;
    } catch {
      alert('Error al intentar subir de curso al alumno.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPromote = async () => {
    if (
      !window.confirm(
        '⚠️ ATENCIÓN: ¿Estás seguro de que deseas enviar la orden masiva para subir a TODOS los alumnos de grado? Esta acción enviará una señal a la base de datos para que todos avancen al siguiente curso.',
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await sendWebhookMutation('Padres_Alumnos', 'SUBIR_CURSO_MASIVO', {});
      alert('Se ha enviado la orden de subida masiva con éxito.');
      await loadData();
    } catch {
      alert('Error al enviar la orden masiva.');
    } finally {
      setLoading(false);
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
        onCellChange={isPadresAlumnos ? handleCellChange : undefined}
        isCellUpdating={
          isPadresAlumnos ? (row, key) => updatingCells.has(getCellKey(row, key)) : undefined
        }
        onToggleFavorite={isPadresAlumnos ? handleTogglePreferred : undefined}
        isFavorite={isPadresAlumnos ? isPreferredClient : undefined}
        isFavoriteUpdating={
          isPadresAlumnos
            ? (row) => preferredClientsLoading || updatingCells.has(getCellKey(row, 'Preferencial'))
            : undefined
        }
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
        title={modalType === 'create' ? 'Nuevo Registro' : 'Editar Registro'}
        columns={modalColumns}
        initialData={selectedRecord}
        onSubmit={handleModalSubmit}
        isSubmitting={isSubmitting}
        studentSearch={
          isClientesPreferenciales && modalType === 'create'
            ? {
                options: preferredStudents,
                isLoading: preferredStudentsLoading,
                childKey: 'nombre_hijo',
                courseKey: 'curso',
                onSelect: (student) => ({
                  'telefono (sin el +)': String(student.telefono_wa_mama || '').replace(/\D/g, ''),
                  nombre: student.nombre_mama || '',
                }),
              }
            : undefined
        }
      />
    </div>
  );
};

export default DataView;
