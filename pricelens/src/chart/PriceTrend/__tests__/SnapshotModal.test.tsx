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

  it('shows an explicitly-flagged demo placeholder when no real evidence matches（2026-11-17 Eason 恢复模拟占位，推翻 11-11「如实空态」拍板；模拟徽标防冒充）', () => {
    render(<SnapshotModal info={{ ...info, url: 'https://www.dns-shop.ru/product/another/' }} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('模拟占位图');
    expect(screen.getByText('模拟')).toBeTruthy(); // 显式模拟徽标（不冒充真实凭证）
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('does not expose an unsafe live-page link', () => {
    render(<SnapshotModal info={{ ...info, url: 'javascript:alert(1)' }} onClose={() => {}} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
