// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../src/renderer/src/components/Modal';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '<div id="root"></div>';
});

describe('Modal', () => {
  it('contains keyboard focus, locks background scrolling, and restores focus', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.querySelector('#root')!.append(opener);
    opener.focus();
    const onClose = vi.fn();
    render(
      <Modal titleId="dialog-title" onClose={onClose}>
        <h2 id="dialog-title">Dialog title</h2>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Dialog title' }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'First' }),
    );
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Last' }), {
      key: 'Tab',
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'First' }),
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('does not dismiss while an async action is pending', () => {
    const onClose = vi.fn();
    render(
      <Modal titleId="dialog-title" onClose={onClose} busy>
        <h2 id="dialog-title">Pending dialog</h2>
        <button>Working</button>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
