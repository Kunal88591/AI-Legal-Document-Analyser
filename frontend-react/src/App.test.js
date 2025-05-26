import { render, screen } from '@testing-library/react';
import App from './App';

test('renders AI Legal Document Analyzer title', () => {
  render(<App />);
  const headingElement = screen.getByText(/AI Legal Document Analyzer/i);
  expect(headingElement).toBeInTheDocument();
});

test('renders upload button', () => {
  render(<App />);
  const buttonElement = screen.getByRole('button', { name: /upload & analyze/i });
  expect(buttonElement).toBeInTheDocument();
});
