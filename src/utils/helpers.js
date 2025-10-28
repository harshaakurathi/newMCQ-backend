// src/utils/helpers.js
const crypto = require('crypto');

function generateUUID() {
    return crypto.randomUUID();
}

function normalizeConcept(concept) {
    if (!concept) return 'general';
    const parts = concept.toString().toLowerCase().trim().split(/\s+/);
    return parts.slice(0, 2).join('-');
}

const getTopicPrefix = (topicName) => {
    const words = topicName.split(' ');
    if (words.length > 1) {
        return words.map(word => word[0]).join('').toUpperCase();
    }
    return topicName.substring(0, 3).toUpperCase();
};

module.exports = {
    generateUUID,
    normalizeConcept,
    getTopicPrefix
};