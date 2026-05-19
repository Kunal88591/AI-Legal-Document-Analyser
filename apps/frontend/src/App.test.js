import { render, screen } from '@testing-library/react';
import App from './App';

test('renders legal intelligence dashboard title', () => {
  render(<App />);
  expect(screen.getByText(/AI Legal Intelligence Command Center/i)).toBeInTheDocument();
});

test('renders upload center controls', () => {
  render(<App />);
  expect(screen.getByText(/Analyze, compare, and inspect locally/i)).toBeInTheDocument();
});
