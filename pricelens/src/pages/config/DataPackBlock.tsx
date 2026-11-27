// ============================================================
// 配置页 · 数据包区块（2026-11-14 Eason「价格数据完全以导入方式承载 +
// 本地可运行、可快速迁移到其他电脑」）：
//  - 导入数据包：单文件 JSON（buildDataPack 产物）→ applyDataPack 原位置换 +
//    IndexedDB 持久化 → 刷新后由两段式启动自动载入；浏览器拒绝持久化时
//    仅本会话生效（memory 置换仍在，UI 明确提示）；
//  - 导出当前数据包：当前内存态（内置或已导入）序列化下载——迁移 = 拷
//    PriceLens.html + 数据包两个文件；
//  - 还原内置数据：清持久化 + 刷新（内置数据始终兜底，不会被导入破坏）。
// 2026-11-18 服务模式（前后端分离）：探测到本机 Python 服务器（server/server.py）
//    时导入/重派生/还原改走服务器 API——导入 = File 直接做 POST body 流式上传
//    （前端零内存压力，117MB 级全量包根治「浏览器导不进」）、服务器 Python 引擎
//    派生 + SQLite 落库、刷新后 bootstrap 从 GET /api/pack 装载 gzip v2 包。
//    单文件模式（file:// 双击打开）链路原样保留（兜底）。
// 查阅者（RBAC）：只读——导入/还原置灰（改的是本机数据承载），导出不限制。
// 数据校验与置换全部在 data/index.ts applyDataPack（先解码校验后整体提交）。
// ============================================================
import { useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Button, Popconfirm, Tooltip, message } from 'antd';
import { DownloadOutlined, ReloadOutlined, RollbackOutlined, UploadOutlined } from '@ant-design/icons';
import { buildDataPack, dataMeta, applyDataPack, type DataPackMeta } from '../../data';
import { clearDataPack, loadDataPack, saveDataPack } from '../../data/dataPackStore';
import { isServiceMode } from '../../data/serviceMode';
import { useConfigVersion } from '../../state/configStore';
import { canEditConfig } from '../../access/role';
import { color } from '../../theme/tokens';

const packFileNameOf = (generatedAt: string): string => {
  const d = new Date(generatedAt);
  const ymd = Number.isNaN(d.getTime()) ? 'export' : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `pricelens-数据包-${ymd}.json`;
};

const fmtTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
};

const infoLine: CSSProperties = { fontSize: 12, lineHeight: '20px', color: color.body };

export default function DataPackBlock({ canEdit }: { canEdit: boolean }) {
  useConfigVersion();
  const meta: DataPackMeta = dataMeta();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const serviceMode = isServiceMode();

  // 服务器 API 结果（服务模式导入/重派生返回的 {ok, error, diag, meta}）。
  // 2026-11-18 审计加固：AbortController 超时（上传+派生 5 分钟上限）——服务器
  // 挂死时 fetch 永不 settle 曾让 busy 恒 true + message.loading(0) 双重泄漏。
  const postServer = async (path: string, body?: BodyInit): Promise<{ error?: string; diag?: DataPackMeta['offersDiag'] }> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5 * 60 * 1000);
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        ...(body != null ? { body } : {}),
        headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      window.clearTimeout(timer);
      throw new Error(error instanceof DOMException && error.name === 'AbortError'
        ? '服务器响应超时（5 分钟）——请检查服务器进程是否还在运行，稍后重试'
        : `无法连接服务器：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      window.clearTimeout(timer);
    }
    const info = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; diag?: DataPackMeta['offersDiag'] } | null;
    if (!res.ok || !info?.ok) throw new Error(info?.error || `服务器响应异常（HTTP ${res.status}）`);
    return { diag: info.diag };
  };

  // 2026-11-18 配置表化：原表模式（v3）包的派生结果依赖当前配置表（系列规则/型号
  // 别名/对标矩阵/分档阶梯/大促档期）。配置表导入后点此按钮 = 用持久化包重跑归一
  // 派生（不改包本身，只重算维表/事实），避免「改了表还要重新选文件导一遍」。
  // 服务模式：POST /api/rederive（服务器用已存原包 + 服务器配置重跑 Python 引擎）。
  const onRederive = async (): Promise<void> => {
    if (busy) return;
    if (!canEditConfig()) {
      message.error('查阅者不可更改本机数据承载，请联系 GTM');
      return;
    }
    setBusy(true);
    try {
      if (serviceMode) {
        const info = await postServer('/api/rederive');
        const diagRows = info.diag?.rowsOut;
        message.success(`已按服务器当前配置重新派生${diagRows != null ? `（${diagRows.toLocaleString()} 事实行）` : ''}，即将刷新页面`);
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }
      const stored = await loadDataPack();
      if (!stored) {
        message.warning('本机没有持久化的数据包（当前数据为内置或未持久化），无需重新派生');
        return;
      }
      const applied = applyDataPack(stored);
      if (!applied.ok) {
        message.error(`重新派生失败：${applied.error}`);
        return;
      }
      message.success(`已按当前配置表重新派生（${applied.counts.products.toLocaleString()} SKU / ${applied.counts.factWeekly.toLocaleString()} 事实行）`);
    } catch (error) {
      message.error(`重新派生失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 同一文件可重复选择
    if (!file || busy) return;
    // 防纵深（2026-11-16 审视修复）：与全站写 API 门控模式一致——按钮置灰之外
    // 入口函数再校验一次 canEditConfig（role.ts 防御清单登记）
    if (!canEditConfig()) {
      message.error('查阅者不可更改本机数据承载，请联系 GTM');
      return;
    }
    setBusy(true);
    try {
      if (serviceMode) {
        // File 直接做 POST body：浏览器流式发送，前端不读全文不 JSON.parse——
        // 117MB 级全量包在服务器 Python 进程处理（内存无压力），根治浏览器端
        // 「五份全量内存拷贝」的崩溃链。上传 + 派生同步等待（本机 localhost，
        // 全量约 10-60s），期间按钮 loading。
        const loading = message.loading('已上传服务器，正在派生（全量包约 1 分钟内）…', 0);
        try {
          const info = await postServer('/api/datapack', file);
          window.setTimeout(loading, 0);
          const diagRows = info.diag?.rowsOut;
          message.success(`数据包已导入服务器（${diagRows != null ? `${diagRows.toLocaleString()} 事实行` : '已生效'}），即将刷新页面`);
          window.setTimeout(() => window.location.reload(), 700);
        } catch (error) {
          window.setTimeout(loading, 0);
          throw error;
        }
        return;
      }
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        message.error('文件不是有效的 JSON');
        return;
      }
      const applied = applyDataPack(parsed);
      if (!applied.ok) {
        message.error(`导入失败：${applied.error}`);
        return;
      }
      const { persisted } = await saveDataPack(parsed as Parameters<typeof saveDataPack>[0]);
      if (!persisted) {
        // 不能刷新（2026-11-16 审视修复）：持久化失败时刷新 = 两段式启动读不到
        // 包、回落内置数据，刚导入的结果被静默撤销。保留本会话内存态并明确警告。
        message.warning('数据包已导入，但浏览器未允许持久化（隐私模式 / 配额限制），仅本次会话生效——刷新或关闭后会回到原数据。如需长期使用，请调整浏览器设置后重新导入。', 6);
        return;
      }
      message.success('数据包已导入并持久化，即将刷新页面');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      message.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onExport = (): void => {
    const pack = buildDataPack();
    const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = packFileNameOf(pack.generatedAt);
    a.click();
    URL.revokeObjectURL(url);
    message.success('数据包已导出（与 PriceLens.html 一起拷贝即可迁移）');
  };

  const onReset = async (): Promise<void> => {
    // 2026-11-18 审计加固：与导入/重派生同款三道门——busy 防并发（reset 在途时
    // 再点导入会两操作交错）、RBAC 纵深（Popconfirm disabled 之外的入口函数复检）
    if (busy) return;
    if (!canEditConfig()) {
      message.error('查阅者不可更改本机数据承载，请联系 GTM');
      return;
    }
    setBusy(true);
    try {
      if (serviceMode) {
        try {
          await postServer('/api/datapack/reset');
        } catch (error) {
          message.error(`还原失败：${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        // 本机旧包一并清掉（服务模式优先服务器包，但防回退混淆）；清失败不能
        // 刷新——applyPersistedDataPack 会把没删掉的包重新载入，与单文件分支
        // 同一 2026-11-16 语义
        const { cleared } = await clearDataPack();
        if (!cleared) {
          message.warning('服务器数据已清空，但本机持久化包清除失败（存储被占用）——请关闭其他标签页后重试，暂不刷新。');
          return;
        }
        message.success('服务器数据已清空，即将刷新页面（回落内置数据）');
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }
    // cleared=false（删除失败）时不能刷新：刷新后 applyPersistedDataPack 会把
    // 没删掉的包重新载入，界面说「已还原」而数据原封不动（2026-11-16 审视修复）
    const { cleared } = await clearDataPack();
    if (!cleared) {
      message.warning('清除持久化数据包失败（存储被占用或不可写），尚未还原——请关闭其他打开了本应用的标签页后重试。');
      return;
    }
    message.success('已还原为内置数据，即将刷新页面');
    window.setTimeout(() => window.location.reload(), 700);
    } finally {
      setBusy(false);
    }
  };

  const readOnlyHint = '查阅者不可更改本机数据承载，请联系 GTM';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <div style={infoLine}>
        当前数据来源：
        <span style={{ fontWeight: 600, color: meta.source === 'imported' ? '#0062d9' : undefined }}>
          {serviceMode
            ? (meta.source === 'imported' ? `服务器数据包（v${meta.packVersion} · Python 引擎派生）` : '服务器模式 · 内置数据（服务器尚无数据包）')
            : meta.source === 'imported' ? `导入数据包（v${meta.packVersion}${meta.packVersion === 3 ? ' · 原表模式' : ''}）` : '内置数据'}
        </span>
        {'　'}数据包生成时间：{fmtTime(meta.generatedAt)}
        {'　'}导入应用时间：{fmtTime(meta.appliedAt)}
        {/* 构建时间（2026-11-17）：分辨「两台机器打开的是不是同一份单文件」——
            数据烘死在 HTML 里，文件版本 = 数据版本；Windows 缓存旧 HTML 时此值
            会明显偏旧（强刷/换最新文件即对齐） */}
        {'　'}构建时间：{fmtTime(__BUILD_TIME__)}
      </div>
      <div style={infoLine} className="tnum">
        事实周行 {meta.counts.factWeekly.toLocaleString()} · 月度行 {meta.counts.factMonthly.toLocaleString()} · 销量行{' '}
        {meta.counts.factSales.toLocaleString()} · SKU {meta.counts.products.toLocaleString()} · 渠道{' '}
        {meta.counts.channels.toLocaleString()} · 国家 {meta.counts.regions.toLocaleString()} · 时间桶{' '}
        {meta.counts.timeBuckets.toLocaleString()}
      </div>
      {meta.offersDiag && (Object.keys(meta.offersDiag.droppedBy).length > 0 || Object.keys(meta.offersDiag.fixed).length > 0) && (
        <div style={{ ...infoLine, color: '#ad6800' }}>
          原表归一（{meta.offersRows.toLocaleString()} 行 → {meta.offersDiag.rowsOut.toLocaleString()} 事实行）：
          {Object.entries(meta.offersDiag.droppedBy).map(([k, v]) => `剔除 ${k} ×${v.toLocaleString()}`).join('、') || '无剔除'}
          {Object.keys(meta.offersDiag.fixed).length > 0
            ? `；自动修复 ${Object.entries(meta.offersDiag.fixed).map(([k, v]) => `${k} ×${v.toLocaleString()}`).join('、')}`
            : ''}
          。
        </div>
      )}
      {meta.source === 'imported' && meta.salesUnmatched > 0 && (
        <div style={{ ...infoLine, color: '#ad6800' }}>
          销量归一提示：{meta.salesUnmatched.toLocaleString()} 行因国家/型号名未匹配被丢弃（可修
          salesProductAliases 别名后重新导入）{meta.salesSkipped > 0 ? `；另有 ${meta.salesSkipped.toLocaleString()} 行周期间/QTY 非法跳过` : ''}。
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tooltip title={canEdit ? '选择 buildDataPack 产出的 .json 数据包' : readOnlyHint}>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!canEdit || busy}
            aria-label="导入数据包"
            onClick={() => fileRef.current?.click()}
          >
            导入数据包
          </Button>
        </Tooltip>
        <Button icon={<DownloadOutlined />} aria-label="导出当前数据包" onClick={onExport} disabled={busy}>
          导出当前数据包
        </Button>
        {(meta.packVersion === 3 || serviceMode) && (
          <Tooltip title={canEdit ? (serviceMode ? '配置表导入后，服务器用已存原包重跑 Python 引擎派生' : '配置表（系列规则/型号别名/对标矩阵/分档阶梯/大促档期）更新后，用持久化数据包重跑归一派生') : readOnlyHint}>
            <Button icon={<ReloadOutlined />} disabled={!canEdit || busy} aria-label="用当前配置表重新派生" onClick={onRederive}>
              用当前配置表重新派生
            </Button>
          </Tooltip>
        )}
        <Tooltip title={canEdit ? '清除持久化数据包并回落内置数据' : readOnlyHint}>
          <Popconfirm
            title="还原内置数据？"
            description="将清除本机持久化的导入数据包，刷新后回到出厂内置数据。"
            okText="还原"
            cancelText="取消"
            disabled={!canEdit || busy}
            onConfirm={onReset}
          >
            <Button icon={<RollbackOutlined />} disabled={!canEdit || busy} aria-label="还原内置数据">
              还原内置数据
            </Button>
          </Popconfirm>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="数据包文件"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
      </div>
      <div style={{ ...infoLine, color: 'rgba(0,0,0,0.45)' }}>
        {serviceMode
          ? '服务器模式：数据承载在本机 PriceAgent 服务器（SQLite + data/ 目录），导入不再受浏览器内存限制（117MB 级全量包可直导）；'
            + '关闭服务器后可直接双击打开单文件 PriceLens.html 走离线兜底（数据以浏览器 IndexedDB 为准）。'
          : '便携迁移：把 PriceLens.html（应用）与本数据包拷到目标电脑 → 双击打开应用 → 配置页「导入数据包」。导入保存在本机浏览器'
            + 'IndexedDB，不影响其他人；「还原内置数据」随时可回出厂口径。导入只替换价格/维表数据，不改动个人配置（选品、模板、阈值用'
            + '「配置导入导出」另行搬运）。'}
      </div>
    </div>
  );
}
