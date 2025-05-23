const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Replace with your actual function to get a bearer token
const getBearerToken = require('../get-access-token');

const baseURL = 'https://aws-api.sigmacomputing.com/v2';

async function listAllWorkbooks(accessToken) {
    try {
        const response = await axios.get(`${baseURL}/workbooks`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data.workbooks.map(wb => ({ id: wb.id, name: wb.name }));
    } catch (error) {
        console.error('Error fetching workbooks:', error.response ? error.response.data : error.message);
        return [];
    }
}

async function initiateExport(workbookId, accessToken) {
    const exportOptions = {
        format: { type: 'pdf', layout: 'portrait' }
    };

    try {
        const response = await axios.post(
            `${baseURL}/workbooks/${workbookId}/export`,
            exportOptions,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.queryId;
    } catch (error) {
        console.error(`Failed to initiate export for workbook ${workbookId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

async function checkExportReady(queryId, accessToken) {
    while (true) {
        try {
            const response = await axios.get(
                `${baseURL}/query/${queryId}/download`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    responseType: 'stream'
                }
            );

            if (response.status === 200) {
                return response.data;
            } else {
                console.log(`Waiting for export to be ready. Status: ${response.status}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        } catch (error) {
            if (error.response && error.response.status === 204) {
                console.log('Export not ready yet. Retrying in 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                console.error('Error checking export status:', error.response ? error.response.data : error.message);
                return null;
            }
        }
    }
}

async function downloadExport(data, filename) {
    const filePath = path.join(__dirname, filename);
    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
        data.pipe(writer);
        writer.on('error', err => {
            writer.close();
            reject(err);
        });
        writer.on('finish', () => {
            console.log(`Export downloaded successfully to: ${filePath}`);
            resolve(true);
        });
    });
}

async function exportAllWorkbooks() {
    const accessToken = await getBearerToken();
    if (!accessToken) {
        console.error('Failed to obtain bearer token.');
        return;
    }

    const workbooks = await listAllWorkbooks(accessToken);
    if (workbooks.length === 0) {
        console.log('No workbooks found to export.');
        return;
    }

    for (const workbook of workbooks) {
        console.log(`Starting export for workbook: ${workbook.name} (ID: ${workbook.id})`);
        const queryId = await initiateExport(workbook.id, accessToken);
        if (!queryId) {
            console.error(`Skipping workbook ${workbook.name} due to export initiation failure.`);
            continue;
        }

        const data = await checkExportReady(queryId, accessToken);
        if (data) {
            const safeName = workbook.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            await downloadExport(data, `${safeName}_${workbook.id}.pdf`);
        } else {
            console.error(`Failed to download export for workbook ${workbook.name}.`);
        }
    }
}

exportAllWorkbooks();
