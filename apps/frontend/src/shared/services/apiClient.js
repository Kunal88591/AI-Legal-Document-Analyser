import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const api = axios.create({
  baseURL,
  timeout: 180000,
});

export const buildWebSocketUrl = () => {
  const target = baseURL || window.location.origin;
  return `${target.replace(/^http/, 'ws')}/ws/copilot`;
};

export const uploadDocument = async (formData) => {
  const { data } = await api.post('/api/documents/upload', formData);
  return data;
};

export const compareDocuments = async (formData) => {
  const { data } = await api.post('/api/documents/compare', formData);
  return data;
};

export const simplifyText = async (text) => {
  const { data } = await api.post('/api/documents/simplify', { text });
  return data;
};

export const chatDocument = async (payload) => {
  const { data } = await api.post('/api/copilot/chat', payload);
  return data;
};

export const getHistory = async (documentId) => {
  const { data } = await api.get(`/api/copilot/history/${documentId}`);
  return data;
};

export const getGraph = async (documentId) => {
  const { data } = await api.get(`/api/intelligence/graph/${documentId}`);
  return data;
};

export const getTimeline = async (documentId) => {
  const { data } = await api.get(`/api/intelligence/timeline/${documentId}`);
  return data;
};