import Papa from 'papaparse';

const SHEET_ID = '10NtHDtHHH5BX2x0jM-WWtPctap6kILSnuAv1r8arfrA';
const WEBHOOK_URL = 'https://automation8n.fluxia.site/webhook/70b25ce8-51d3-48b9-ad1e-fd4bc6320653';

/**
 * Fetch data from a specific sheet
 * @param {string} sheetName 
 * @returns {Promise<Array>}
 */
export const fetchSheetData = async (sheetName) => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheetName)}`;
  
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (err) => {
        console.error(`Error fetching sheet ${sheetName}:`, err);
        reject(err);
      }
    });
  });
};

/**
 * Send a mutation to the webhook
 * @param {string} section - e.g. "Padres_Alumnos"
 * @param {string} action - "ALTA", "BAJA", "MODIFICACION"
 * @param {object} payload - The record data
 */
export const sendWebhookMutation = async (section, action, payload) => {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        seccion: section,
        accion: action,
        datos: payload,
        fecha: new Date().toISOString()
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Webhook error: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error sending webhook:', error);
    throw error;
  }
};
