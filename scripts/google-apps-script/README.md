# Descuento automático diario BFIT

Este script se ejecuta dentro del Google Sheet de BFIT y envía las modificaciones al webhook existente de n8n.

## Reglas implementadas

- Zona horaria: `America/La_Paz`.
- Procesamiento de lunes a viernes después de las 09:31.
- Se ejecuta como máximo una vez por día.
- No descuenta cuando el saldo es cero, negativo o menor al total del consumo.
- Almuerzo Pre K, Kinder y Primaria: lee `precio_primaria_dia` desde `Config`.
- Almuerzo Secundaria: lee `precio_secundaria_dia` desde `Config`.
- Meriendita: lee `precio_meriendita_dia` desde `Config`.
- `Consume merienda? = Si` suma la meriendita al almuerzo.
- Si `tipo_menu` es solamente `Meriendita`, cobra únicamente la meriendita.
- La observación “Consume meriendita solo los Lunes” limita ese consumo a los lunes.
- Una ausencia para el día actual, registrada hasta las 09:30, evita el descuento.
- Una ausencia registrada después del corte no revierte el cobro.
- La hoja `Registro_Consumos` se crea automáticamente y utiliza un identificador diario para evitar duplicados.

## Instalación segura

1. Abrir la planilla BFIT con una cuenta que tenga permiso de edición.
2. Ir a **Extensiones → Apps Script**.
3. Crear o abrir `Código.gs` y pegar el contenido completo de `descuento-consumos.gs`.
4. En **Configuración del proyecto**, seleccionar la zona horaria `America/La_Paz`.
5. Guardar el proyecto.
6. Ejecutar manualmente `simularDescuentosHoy` y autorizar los permisos solicitados.
7. Revisar **Ejecuciones → Registros**. La simulación no modifica saldos ni llama al webhook.
8. Volver a la planilla y recargarla. Aparecerá el menú **BFIT - Consumos**.
9. Cuando la simulación esté aprobada, usar **BFIT - Consumos → Instalar automatización**.

El disparador consulta cada cinco minutos, pero el código no procesa antes de las 09:31 y registra la fecha exitosa para no volver a cobrar durante ese día.

## Desactivación

Usar **BFIT - Consumos → Desinstalar automatización**. Esto elimina únicamente el disparador asociado al descuento diario; no borra registros ni modifica saldos.

## Prueba recomendada

Antes de activarlo en producción, crear una copia de la planilla y sustituir temporalmente `webhookUrl` por un webhook de prueba. Verificar especialmente:

- alumno de primaria sin meriendita;
- alumno de secundaria;
- alumno con almuerzo y meriendita;
- alumno con meriendita solamente los lunes;
- alumno ausente antes de las 09:31;
- saldos `0`, negativos e inferiores al consumo;
- repetición manual de la ejecución del mismo día.

