// require('dotenv').config({ path: 'sigma-api-recipes/.env' });

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const getBearerToken = require('../get-access-token');

const baseURL = 'https://api.sigmacomputing.com/v2';
const workbookId = '29z2Jg1ww2LXiYd6BVeOh3'; // Replace with your actual workbook ID

async function initiateExport(accessToken) {
    const exportOptions = {
        format: { type: 'json' },
        useAsynchronously: true,
        rowLimit: 1000000 // Optional: adjust based on expected data size
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
        console.log('Export initiated:', response.data);
        return response.data.queryId;
    } catch (error) {
        console.error('Failed to initiate export:', error.response?.data || error.message);
        return null;
    }
}

async function checkExportReady(queryId, accessToken) {
    console.log(`Polling for export readiness: ${queryId}`);
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
                console.log('Export is ready.');
                return response.data;
            }
        } catch (error) {
            if (error.response?.status === 204) {
                console.log('Export not ready yet. Retrying in 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                console.error('Error checking export status:', error.response?.data || error.message);
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
        writer.on('error', reject);
        writer.on('finish', () => {
            console.log(`Export saved to ${filePath}`);
            resolve(true);
        });
    });
}

async function exportWorkflow() {
    const accessToken = await getBearerToken();
    if (!accessToken) {
        console.error('Could not retrieve access token.');
        return;
    }

    const queryId = await initiateExport(accessToken);
    if (!queryId) return;

    const data = await checkExportReady(queryId, accessToken);
    if (data) {
        await downloadExport(data, 'WorkbookExport.json');
    } else {
        console.error('Export failed or timed out.');
    }

    process.exit(0);
}

exportWorkflow();
