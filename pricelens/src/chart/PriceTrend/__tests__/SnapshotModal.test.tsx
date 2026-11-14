// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import SnapshotModal from '../SnapshotModal';
import capture from '../../../assets/snapshots/dns-pura90s-20261111-source.json';

vi.mock('antd', () => ({ Modal: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
afterEach(cleanup);

const info = {
  seriesLabel: 'Pura 90s Pro Max 12+256 GB', shopName: 'DNS', bucketId: '202645',
  granularity: 'week' as const, dateText: '11-04', priceText: '$1,098', url: capture.url,
};

describe('snapshot evidence boundary', () => {
  it('labels selected USD history and the later RUB screenshot as separate observations', () => {
    render(<SnapshotModal info={info} onClose={() => {}} />);
    expect(screen.getByText('所选历史事实 · 2026-W45 · 11-04 · $1,098')).toBeTruthy();
    expect(screen.getByText('截图页面价 86 499 ₽')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('不能证明所选周期的价格');
    expect(screen.getByRole('img').getAttribute('alt')).toContain('非所选周期凭证');
    expect(screen.queryByText(/当时价格/)).toBeNull();
  });

  it('shows a genuine empty evidence state rather than a substitute picture', () => {
    render(<SnapshotModal info={{ ...info, url: 'https://www.dns-shop.ru/product/another/' }} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('暂无快照');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('does not expose an unsafe live-page link', () => {
    render(<SnapshotModal info={{ ...info, url: 'javascript:alert(1)' }} onClose={() => {}} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
