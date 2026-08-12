/**
 * BFIT - Descuento automatico diario de consumos.
 *
 * Este archivo se pega completo en un proyecto de Google Apps Script vinculado
 * a la planilla BFIT. Antes de instalar el disparador, ejecutar
 * simularDescuentosHoy() y revisar el registro de ejecucion.
 */

const BFIT = Object.freeze({
  zonaHoraria: 'America/La_Paz',
  horaCorte: '09:30',
  horaInicio: '09:31',
  hojaAlumnos: 'Padres_Alumnos',
  hojaConfig: 'Config',
  hojaObservaciones: 'Observaciones',
  hojaRegistro: 'Registro_Consumos',
  webhookUrl: 'https://automation8n.fluxia.site/webhook/70b25ce8-51d3-48b9-ad1e-fd4bc6320653',
  handler: 'procesarDescuentosDiarios',
  propiedadUltimaEjecucion: 'BFIT_ULTIMA_EJECUCION_OK',
  tamanoLoteWebhook: 25,
});

const ENCABEZADOS_REGISTRO = Object.freeze([
  'id_operacion',
  'fecha_consumo',
  'fecha_procesamiento',
  'alumno',
  'curso',
  'telefono_madre',
  'telefono_padre',
  'almuerzo_bs',
  'meriendita_bs',
  'total_bs',
  'saldo_anterior_bs',
  'saldo_nuevo_bs',
  'estado',
  'detalle',
]);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BFIT - Consumos')
    .addItem('Simular descuentos de hoy', 'simularDescuentosHoy')
    .addSeparator()
    .addItem('Instalar automatizacion', 'instalarAutomatizacionDescuentos')
    .addItem('Desinstalar automatizacion', 'desinstalarAutomatizacionDescuentos')
    .addToUi();
}

/**
 * No modifica saldos ni llama al webhook.
 */
function simularDescuentosHoy() {
  const plan = construirPlanDescuentos_(new Date());
  const resumen = resumirPlan_(plan);

  console.log(JSON.stringify(plan, null, 2));
  SpreadsheetApp.getUi().alert(
    'Simulacion BFIT',
    `${resumen}\n\nNo se modifico ningun saldo. El detalle completo esta en el registro de ejecucion.`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

/**
 * Instala un disparador cada cinco minutos. El codigo solo procesa una vez por
 * dia, de lunes a viernes, a partir de las 09:31 de Bolivia.
 */
function instalarAutomatizacionDescuentos() {
  desinstalarAutomatizacionDescuentos_(false);
  ScriptApp.newTrigger(BFIT.handler).timeBased().everyMinutes(5).create();

  SpreadsheetApp.getUi().alert(
    'Automatizacion instalada',
    'El control se ejecutara cada cinco minutos y procesara una sola vez por dia habil despues de las 09:31.',
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

function desinstalarAutomatizacionDescuentos() {
  desinstalarAutomatizacionDescuentos_(true);
}

function desinstalarAutomatizacionDescuentos_(mostrarAviso) {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === BFIT.handler)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  if (mostrarAviso) {
    SpreadsheetApp.getUi().alert('Automatizacion desinstalada');
  }
}

/**
 * Funcion invocada por el disparador. Tambien puede ejecutarse manualmente,
 * pero fuera del horario o en fines de semana no realiza cambios.
 */
function procesarDescuentosDiarios() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    console.log('Otra ejecucion se encuentra en curso. Se cancela esta corrida.');
    return;
  }

  try {
    const ahora = new Date();
    const fecha = fechaLocal_(ahora);

    if (!esDiaHabil_(fecha)) {
      console.log('Hoy no es un dia habil.');
      return;
    }

    if (horaLocal_(ahora) < BFIT.horaInicio) {
      console.log(`Todavia no son las ${BFIT.horaInicio}.`);
      return;
    }

    const properties = PropertiesService.getScriptProperties();

    if (properties.getProperty(BFIT.propiedadUltimaEjecucion) === fecha) {
      console.log(`Los consumos de ${fecha} ya fueron procesados.`);
      return;
    }

    const plan = construirPlanDescuentos_(ahora);
    const hojaRegistro = obtenerOCrearRegistro_();
    const registrosExistentes = leerRegistrosPorId_(hojaRegistro);
    const pendientes = prepararOperaciones_(plan.operaciones, hojaRegistro, registrosExistentes, ahora);

    if (pendientes.length > 0) {
      enviarOperaciones_(pendientes, hojaRegistro, ahora);
    }

    const fallidas = pendientes.filter((operacion) => operacion.estadoFinal !== 'APLICADO');

    if (fallidas.length > 0) {
      throw new Error(`${fallidas.length} operacion(es) no pudieron confirmarse. Se reintentara en la siguiente corrida.`);
    }

    properties.setProperty(BFIT.propiedadUltimaEjecucion, fecha);
    console.log(resumirPlan_(plan));
  } finally {
    lock.releaseLock();
  }
}

function construirPlanDescuentos_(ahora) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hojaAlumnos = exigirHoja_(libro, BFIT.hojaAlumnos);
  const hojaConfig = exigirHoja_(libro, BFIT.hojaConfig);
  const hojaObservaciones = exigirHoja_(libro, BFIT.hojaObservaciones);
  const tablaAlumnos = leerTabla_(hojaAlumnos);
  const precios = leerPrecios_(hojaConfig);
  const fecha = fechaLocal_(ahora);
  const ausentes = obtenerAusentesAntesDelCorte_(hojaObservaciones, fecha);
  const operaciones = [];
  const omitidos = {
    inactivos: 0,
    ausentes: 0,
    sinConsumo: 0,
    saldoInsuficiente: 0,
  };

  tablaAlumnos.filas.forEach((fila, indice) => {
    const registro = objetoDesdeFila_(tablaAlumnos.encabezados, fila);
    const alumno = texto_(registro.nombre_hijo);

    if (!alumno || !esActivo_(registro.activo)) {
      omitidos.inactivos += 1;
      return;
    }

    if (ausentes.has(normalizarTexto_(alumno))) {
      omitidos.ausentes += 1;
      return;
    }

    const consumo = calcularConsumo_(registro, precios, fecha);

    if (consumo.total <= 0) {
      omitidos.sinConsumo += 1;
      return;
    }

    const saldoAnterior = numero_(registro.saldo_bs);

    // Nunca descuenta si el saldo es cero, negativo o menor al consumo total.
    if (saldoAnterior <= 0 || saldoAnterior < consumo.total) {
      omitidos.saldoInsuficiente += 1;
      return;
    }

    const saldoNuevo = redondear_(saldoAnterior - consumo.total);
    const filaActualizada = { ...registro, saldo_bs: saldoNuevo };
    const identidad = [
      fecha,
      normalizarTexto_(alumno),
      soloDigitos_(registro.telefono_wa_mama),
      soloDigitos_(registro.telefono_wa_papa),
      normalizarTexto_(registro.curso),
    ].join('|');

    operaciones.push({
      id: sha256_(identidad),
      fecha,
      numeroFila: indice + 2,
      alumno,
      curso: texto_(registro.curso),
      telefonoMadre: soloDigitos_(registro.telefono_wa_mama),
      telefonoPadre: soloDigitos_(registro.telefono_wa_papa),
      almuerzo: consumo.almuerzo,
      meriendita: consumo.meriendita,
      total: consumo.total,
      saldoAnterior,
      saldoNuevo,
      filaActualizada,
      detalle: consumo.detalle,
    });
  });

  return { fecha, precios, ausentes: ausentes.size, operaciones, omitidos };
}

function calcularConsumo_(registro, precios, fecha) {
  const tipoMenu = normalizarTexto_(registro.tipo_menu);
  const curso = normalizarTexto_(registro.curso);
  const observaciones = normalizarTexto_(registro.observaciones);
  const consumeMerienda = esSi_(registro['Consume merienda?']) || tipoMenu.includes('meriend');
  const esSoloMeriendita = tipoMenu.includes('meriend') && !tipoMenu.includes('tradicional') && !tipoMenu.includes('fit');
  const consumeAlmuerzo = !esSoloMeriendita && (tipoMenu.includes('tradicional') || tipoMenu.includes('fit'));
  const esSecundaria = curso.includes('secundaria');
  const esLunes = diaSemana_(fecha) === 1;
  const meriendaSoloLunes = /(?:solo|solamente).*lunes/.test(observaciones);
  const cobrarMerienda = consumeMerienda && (!meriendaSoloLunes || esLunes);
  const almuerzo = consumeAlmuerzo
    ? esSecundaria
      ? precios.precioSecundaria
      : precios.precioPrimaria
    : 0;
  const meriendita = cobrarMerienda ? precios.precioMeriendita : 0;
  const conceptos = [];

  if (almuerzo > 0) conceptos.push(esSecundaria ? 'Almuerzo secundaria' : 'Almuerzo primaria');
  if (meriendita > 0) conceptos.push(meriendaSoloLunes ? 'Meriendita (solo lunes)' : 'Meriendita');

  return {
    almuerzo,
    meriendita,
    total: redondear_(almuerzo + meriendita),
    detalle: conceptos.join(' + '),
  };
}

function leerPrecios_(hojaConfig) {
  const tabla = leerTabla_(hojaConfig);
  const valores = {};

  tabla.filas.forEach((fila) => {
    const item = objetoDesdeFila_(tabla.encabezados, fila);
    valores[normalizarTexto_(item.variable)] = numero_(item.valor);
  });

  const precios = {
    precioPrimaria: valores.precio_primaria_dia,
    precioSecundaria: valores.precio_secundaria_dia,
    precioMeriendita: valores.precio_meriendita_dia,
  };

  Object.entries(precios).forEach(([nombre, valor]) => {
    if (!(valor > 0)) throw new Error(`Falta configurar ${nombre} en la hoja Config.`);
  });

  return precios;
}

function obtenerAusentesAntesDelCorte_(hojaObservaciones, fechaConsumo) {
  const tabla = leerTabla_(hojaObservaciones);
  const ausentes = new Set();

  tabla.filas.forEach((fila) => {
    const observacion = objetoDesdeFila_(tabla.encabezados, fila);
    const alumno = texto_(observacion.alumno);
    const motivo = normalizarTexto_(observacion.motivo_de_falta);

    if (!alumno || !esMotivoDeAusencia_(motivo)) return;

    const fechaRegistro = fechaDesdeRegistro_(observacion.fecha);
    if (!fechaRegistro) return;

    const fechaObjetivo = motivo.includes('manana') ? sumarDias_(fechaRegistro, 1) : fechaRegistro;
    if (fechaObjetivo !== fechaConsumo) return;

    const horaRegistro = horaDesdeRegistro_(observacion.fecha, observacion.hora_registro);
    const fueAntesDelCorte = fechaRegistro < fechaConsumo || (fechaRegistro === fechaConsumo && horaRegistro <= BFIT.horaCorte);

    if (fueAntesDelCorte) ausentes.add(normalizarTexto_(alumno));
  });

  return ausentes;
}

function esMotivoDeAusencia_(motivo) {
  return /(no almuer|no asistir|no ira|no va|enferm|ausen|falta)/.test(motivo);
}

function prepararOperaciones_(operaciones, hojaRegistro, existentes, ahora) {
  const pendientes = [];

  operaciones.forEach((operacion) => {
    const existente = existentes.get(operacion.id);

    if (existente && existente.estado === 'APLICADO') return;

    if (existente && ['PREPARADO', 'REVISAR'].includes(existente.estado)) {
      hojaRegistro.getRange(existente.fila, 13, 1, 2).setValues([
        ['REVISAR', 'Ejecucion anterior sin confirmacion. No se reenvio para evitar un cobro duplicado.'],
      ]);
      operacion.estadoFinal = 'REVISAR';
      return;
    }

    if (existente && existente.estado === 'ERROR') {
      operacion.filaRegistro = existente.fila;
      hojaRegistro.getRange(existente.fila, 2, 1, ENCABEZADOS_REGISTRO.length - 1).setValues([
        filaRegistro_(operacion, ahora, 'PREPARADO', 'Reintento preparado.' ).slice(1),
      ]);
    } else {
      hojaRegistro.appendRow(filaRegistro_(operacion, ahora, 'PREPARADO', 'Pendiente de envio al webhook.'));
      operacion.filaRegistro = hojaRegistro.getLastRow();
    }

    pendientes.push(operacion);
  });

  SpreadsheetApp.flush();
  return pendientes;
}

function enviarOperaciones_(operaciones, hojaRegistro, ahora) {
  for (let inicio = 0; inicio < operaciones.length; inicio += BFIT.tamanoLoteWebhook) {
    const lote = operaciones.slice(inicio, inicio + BFIT.tamanoLoteWebhook);
    const solicitudes = lote.map((operacion) => ({
      url: BFIT.webhookUrl,
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        seccion: BFIT.hojaAlumnos,
        accion: 'MODIFICACION',
        datos: operacion.filaActualizada,
        fecha: ahora.toISOString(),
        id_operacion_automatica: operacion.id,
      }),
    }));

    let respuestas;

    try {
      respuestas = UrlFetchApp.fetchAll(solicitudes);
    } catch (error) {
      lote.forEach((operacion) => {
        operacion.estadoFinal = 'ERROR';
        actualizarEstadoRegistro_(
          hojaRegistro,
          operacion.filaRegistro,
          'ERROR',
          `${operacion.detalle}. Error de red: ${error.message}`,
        );
      });
      continue;
    }

    respuestas.forEach((respuesta, indice) => {
      const operacion = lote[indice];
      const codigo = respuesta.getResponseCode();

      if (codigo >= 200 && codigo < 300) {
        operacion.estadoFinal = 'APLICADO';
        actualizarEstadoRegistro_(
          hojaRegistro,
          operacion.filaRegistro,
          'APLICADO',
          `${operacion.detalle}. Webhook confirmado (${codigo}).`,
        );
      } else {
        operacion.estadoFinal = 'ERROR';
        const cuerpo = respuesta.getContentText().slice(0, 300);
        actualizarEstadoRegistro_(
          hojaRegistro,
          operacion.filaRegistro,
          'ERROR',
          `${operacion.detalle}. Webhook ${codigo}: ${cuerpo}`,
        );
      }
    });

    SpreadsheetApp.flush();
    if (inicio + BFIT.tamanoLoteWebhook < operaciones.length) Utilities.sleep(500);
  }
}

function obtenerOCrearRegistro_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(BFIT.hojaRegistro);

  if (!hoja) hoja = libro.insertSheet(BFIT.hojaRegistro);

  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, ENCABEZADOS_REGISTRO.length).setValues([ENCABEZADOS_REGISTRO]);
    hoja.setFrozenRows(1);
  }

  const encabezados = hoja.getRange(1, 1, 1, ENCABEZADOS_REGISTRO.length).getValues()[0];
  if (encabezados.join('|') !== ENCABEZADOS_REGISTRO.join('|')) {
    throw new Error(`La hoja ${BFIT.hojaRegistro} existe pero sus encabezados no coinciden con los esperados.`);
  }

  return hoja;
}

function leerRegistrosPorId_(hoja) {
  const registros = new Map();
  if (hoja.getLastRow() < 2) return registros;

  const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS_REGISTRO.length).getValues();
  valores.forEach((fila, indice) => {
    if (fila[0]) registros.set(String(fila[0]), { fila: indice + 2, estado: String(fila[12] || '') });
  });
  return registros;
}

function filaRegistro_(operacion, ahora, estado, detalleEstado) {
  return [
    operacion.id,
    operacion.fecha,
    Utilities.formatDate(ahora, BFIT.zonaHoraria, "yyyy-MM-dd'T'HH:mm:ss"),
    operacion.alumno,
    operacion.curso,
    operacion.telefonoMadre,
    operacion.telefonoPadre,
    operacion.almuerzo,
    operacion.meriendita,
    operacion.total,
    operacion.saldoAnterior,
    operacion.saldoNuevo,
    estado,
    `${operacion.detalle}. ${detalleEstado}`,
  ];
}

function actualizarEstadoRegistro_(hoja, fila, estado, detalle) {
  hoja.getRange(fila, 13, 1, 2).setValues([[estado, detalle]]);
}

function resumirPlan_(plan) {
  const total = plan.operaciones.reduce((suma, operacion) => suma + operacion.total, 0);
  return [
    `Fecha: ${plan.fecha}`,
    `Operaciones a cobrar: ${plan.operaciones.length}`,
    `Total previsto: Bs ${redondear_(total)}`,
    `Ausentes antes del corte: ${plan.ausentes}`,
    `Omitidos por saldo insuficiente: ${plan.omitidos.saldoInsuficiente}`,
    `Omitidos por estar inactivos: ${plan.omitidos.inactivos}`,
    `Omitidos por no tener consumo reconocido: ${plan.omitidos.sinConsumo}`,
  ].join('\n');
}

function leerTabla_(hoja) {
  const valores = hoja.getDataRange().getValues();
  if (valores.length === 0) throw new Error(`La hoja ${hoja.getName()} esta vacia.`);
  return { encabezados: valores[0].map(texto_), filas: valores.slice(1) };
}

function objetoDesdeFila_(encabezados, fila) {
  return encabezados.reduce((objeto, encabezado, indice) => {
    objeto[encabezado] = fila[indice];
    return objeto;
  }, {});
}

function exigirHoja_(libro, nombre) {
  const hoja = libro.getSheetByName(nombre);
  if (!hoja) throw new Error(`No existe la hoja ${nombre}.`);
  return hoja;
}

function esActivo_(valor) {
  return ['true', 'activo', 'si', '1'].includes(normalizarTexto_(valor));
}

function esSi_(valor) {
  return ['si', 'true', '1'].includes(normalizarTexto_(valor));
}

function fechaDesdeRegistro_(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return fechaLocal_(valor);

  const texto = texto_(valor);
  if (texto.includes('T')) {
    const fechaIso = new Date(texto);
    if (!Number.isNaN(fechaIso.getTime())) return fechaLocal_(fechaIso);
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const latino = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (latino) return `${latino[3]}-${latino[2].padStart(2, '0')}-${latino[1].padStart(2, '0')}`;
  return '';
}

function horaDesdeRegistro_(fecha, hora) {
  const horaTexto = texto_(hora).match(/(\d{1,2}):(\d{2})/);
  if (horaTexto) return `${horaTexto[1].padStart(2, '0')}:${horaTexto[2]}`;
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) return horaLocal_(fecha);

  const fechaTexto = texto_(fecha);
  if (fechaTexto.includes('T')) {
    const fechaIso = new Date(fechaTexto);
    if (!Number.isNaN(fechaIso.getTime())) return horaLocal_(fechaIso);
  }

  return '00:00';
}

function fechaLocal_(fecha) {
  return Utilities.formatDate(fecha, BFIT.zonaHoraria, 'yyyy-MM-dd');
}

function horaLocal_(fecha) {
  return Utilities.formatDate(fecha, BFIT.zonaHoraria, 'HH:mm');
}

function sumarDias_(fechaTexto, cantidad) {
  const [ano, mes, dia] = fechaTexto.split('-').map(Number);
  const fecha = new Date(Date.UTC(ano, mes - 1, dia + cantidad));
  return Utilities.formatDate(fecha, 'UTC', 'yyyy-MM-dd');
}

function diaSemana_(fechaTexto) {
  const [ano, mes, dia] = fechaTexto.split('-').map(Number);
  const diaUtc = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return diaUtc === 0 ? 7 : diaUtc;
}

function esDiaHabil_(fechaTexto) {
  return diaSemana_(fechaTexto) <= 5;
}

function numero_(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = texto_(valor).replace(/[^\d,.-]/g, '');
  if (!texto) return 0;

  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function redondear_(numero) {
  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

function normalizarTexto_(valor) {
  return texto_(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function texto_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function soloDigitos_(valor) {
  return texto_(valor).replace(/\D/g, '');
}

function sha256_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map((byte) => (byte + 256).toString(16).slice(-2)).join('');
}
