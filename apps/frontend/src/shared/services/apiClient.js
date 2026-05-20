import axios from 'axios';

import {
  AnalysisResponseSchema,
  ChatResponseSchema,
  ComparisonResponseSchema,
  GraphResponseSchema,
  HistoryResponseSchema,
  TimelineResponseSchema,
  parseWith,
} from '@legalai/shared-types';

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
  return parseWith(AnalysisResponseSchema, data, 'AnalysisResponse');
};

export const compareDocuments = async (formData) => {
  const { data } = await api.post('/api/documents/compare', formData);
  return parseWith(ComparisonResponseSchema, data, 'ComparisonResponse');
};

export const simplifyText = async (text) => {
  const { data } = await api.post('/api/documents/simplify', { text });
  return data;
};

export const chatDocument = async (payload) => {
  const { data } = await api.post('/api/copilot/chat', payload);
  return parseWith(ChatResponseSchema, data, 'ChatResponse');
};

export const getHistory = async (documentId) => {
  const { data } = await api.get(`/api/copilot/history/${documentId}`);
  return parseWith(HistoryResponseSchema, data, 'HistoryResponse');
};

export const getGraph = async (documentId) => {
  const { data } = await api.get(`/api/intelligence/graph/${documentId}`);
  return parseWith(GraphResponseSchema, data, 'GraphResponse');
};

export const getTimeline = async (documentId) => {
  const { data } = await api.get(`/api/intelligence/timeline/${documentId}`);
  return parseWith(TimelineResponseSchema, data, 'TimelineResponse');
};