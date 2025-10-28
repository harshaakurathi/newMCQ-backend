// src/services/judge0Service.js
const axios = require('axios');

const executeCode = async (source_code, language_id) => {
    const options = {
        method: 'POST',
        url: 'https://judge0-ce.p.rapidapi.com/submissions',
        params: {
            base64_encoded: 'false',
            fields: '*'
        },
        headers: {
            'content-type': 'application/json',
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        data: {
            language_id: language_id,
            source_code: source_code,
        }
    };

    // 1. Submit the code
    const submissionResponse = await axios.request(options);
    const token = submissionResponse.data.token;

    if (!token) {
        throw new Error('Failed to get submission token.');
    }

    let resultResponse;
    let statusId;

    // 2. Poll for the result
    do {
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        resultResponse = await axios.request({
            method: 'GET',
            url: `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
            params: { base64_encoded: 'false', fields: '*' },
            headers: {
                'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
            }
        });
        statusId = resultResponse.data.status.id;
    } while (statusId === 1 || statusId === 2); // In Queue or Processing

    return resultResponse.data;
};

module.exports = { executeCode };