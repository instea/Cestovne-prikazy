import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the shared app name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Leaves' })).toBeDefined();
  });
});
