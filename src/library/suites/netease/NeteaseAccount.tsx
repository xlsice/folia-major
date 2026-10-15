import React from 'react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, LogOut, RotateCw } from 'lucide-react';
import type { LibraryAccountSurfaceProps, LibraryLoginSessionSnapshot } from '../../core/contracts/account';
import type { LibraryHomeMessage } from '../../core/contracts/homeModel';
import type { OnlineProviderId, ProviderAccountSummary } from '../../../types/onlineMusic';
import { buildNeteasePalette } from './neteaseTheme';
import { NeteaseShell } from './neteaseParts';

/** 契约的文案是 {key, values?, fallback?}，翻译层在这里收口；缺 key 时退回 fallback，再退回 key 本身。 */
const say = (message: LibraryHomeMessage | null): string => {
    if (!message) return '';
    return message.fallback || message.key;
};

/** 平台显示名：快照里的 provider 摘要优先，回退到 id。 */
const labelOf = (providers: readonly ProviderAccountSummary[], id: OnlineProviderId): string => {
    const found = providers.find(item => item.providerId === id);
    return found?.shortName || found?.displayName || id;
};

// src/library/suites/netease/NeteaseAccount.tsx
// 登录 / 切换平台。网易云手机版的登录是一张居中的卡片：标题 + 二维码 + 状态行 + 底部动作。
//
// 契约要求：只在 login 或 pendingSwitch 非空时渲染。宿主只给 login / pendingSwitch 两种会话，
// 全部动作都走 account controller（这个 controller 是宿主持有的，suite 不建第二份账户状态）。
// 这套流程上一轮已经真机验证过（网易云扫码登录可用），这里换皮不换逻辑。

const NeteaseAccount: React.FC<LibraryAccountSurfaceProps> = ({
    account,
    theme,
    isDaylight,
    isInteractive,
    declaredActions,
    layer,
}) => {
    const snapshot = useSyncExternalStore(
        React.useCallback(listener => account.subscribe(listener), [account]),
        React.useCallback(() => account.getSnapshot(), [account]),
    );

    // 首页 surface 交上来的 portal 挂点；没接上时退回 document.body。
    const [layerElement, setLayerElement] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
        const read = () => setLayerElement(layer.getElement());
        read();
        return layer.subscribe(read);
    }, [layer]);

    const palette = React.useMemo(() => buildNeteasePalette(theme, isDaylight), [theme, isDaylight]);
    const can = new Set(declaredActions.actions);

    const login = snapshot.login;
    const pendingSwitch = snapshot.pendingSwitch;
    const target = login ?? pendingSwitch;
    if (!target) return null;

    const container = layerElement ?? (typeof document !== 'undefined' ? document.body : null);
    if (!container) return null;

    const card = (
        <NeteaseShell palette={palette}>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center px-8"
                style={{ background: 'var(--nt-scrim)' }}
            >
                <div
                    className="w-full max-w-[19rem] overflow-hidden rounded-2xl"
                    style={{ background: 'var(--nt-elevated)', border: '1px solid var(--nt-divider)' }}
                >
                    {login ? (
                        <LoginCard
                            login={login}
                            can={can}
                            interactive={isInteractive}
                            onSelectMethod={methodId => void account.selectLoginMethod(methodId)}
                            onRetry={() => void account.retryLogin()}
                            onClose={() => account.closeLogin()}
                            onRestartBackend={() => void account.restartLoginBackend()}
                            onDiagnostics={() => void account.buildLoginDiagnosticReport()}
                        />
                    ) : pendingSwitch ? (
                        <SwitchCard
                            fromLabel={labelOf(snapshot.providers, pendingSwitch.from)}
                            toLabel={labelOf(snapshot.providers, pendingSwitch.to)}
                            interactive={isInteractive}
                            onConfirm={() => void account.confirmSwitch(pendingSwitch.id)}
                            onCancel={() => account.cancelSwitch(pendingSwitch.id)}
                        />
                    ) : null}
                </div>
            </div>
        </NeteaseShell>
    );

    return createPortal(card, container);
};

/** 登录卡：标题 → 二维码 / 故障说明 → 状态行 → 动作。 */
const LoginCard: React.FC<{
    login: LibraryLoginSessionSnapshot;
    can: Set<string>;
    interactive: boolean;
    onSelectMethod: (methodId: string) => void;
    onRetry: () => void;
    onClose: () => void;
    onRestartBackend: () => void;
    onDiagnostics: () => void;
}> = ({ login, can, interactive, onSelectMethod, onRetry, onClose, onRestartBackend, onDiagnostics }) => {
    // 阶段文案：直接从契约的 copy 拿（它已经是 i18n key，这里原样显示）
    const statusText = say(login.copy.status);
    const backendDown = login.backend.failed;
    const cooldown = login.retryCooldownSeconds ?? 0;
    const canRetry = (login.phase === 'expired' || login.phase === 'error') && !backendDown && cooldown <= 0;

    return (
        <>
            <div className="px-6 pb-2 pt-6 text-center">
                <h2 className="nt-t-title" style={{ color: 'var(--nt-text)' }}>{say(login.copy.title)}</h2>
                <p className="mt-1 nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>{say(login.copy.note)}</p>
            </div>

            {/* 多登录方式：QQ 两步式 */}
            {login.phase === 'choosing-method' && (
                <div className="px-6 pb-2">
                    {login.methods.map(method => (
                        <button
                            key={method.id}
                            type="button"
                            disabled={!interactive}
                            onClick={() => onSelectMethod(method.id)}
                            className="mb-2 w-full rounded-lg py-3 nt-t-item"
                            style={{ background: 'var(--nt-hover)', color: 'var(--nt-text)' }}
                        >
                            {method.labelKey}
                        </button>
                    ))}
                </div>
            )}

            {/* 二维码 / 故障 / 加载 */}
            <div className="flex justify-center px-6 pb-4 pt-1">
                {backendDown ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                        <AlertCircle size={26} style={{ color: '#e5484d' }} />
                        <p className="nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>登录服务未运行</p>
                        {can.has('account-backend-restart') && (
                            <button
                                type="button"
                                onClick={onRestartBackend}
                                disabled={!login.backend.canRestart || login.backend.restarting}
                                className="mt-1 rounded-full px-4 py-2 nt-t-label disabled:opacity-40"
                                style={{ background: 'var(--nt-accent)', color: 'var(--nt-on-accent)' }}
                            >
                                {login.backend.restarting ? '重启中…' : '重启服务'}
                            </button>
                        )}
                    </div>
                ) : login.qrImageUrl ? (
                    <img
                        src={login.qrImageUrl}
                        alt={say(login.copy.title)}
                        className="h-[11.5rem] w-[11.5rem] rounded-lg"
                        style={{ background: '#ffffff' }}
                    />
                ) : (
                    <div className="flex h-[11.5rem] w-[11.5rem] items-center justify-center rounded-lg"
                        style={{ background: 'var(--nt-field)' }}>
                        <RotateCw size={20} className="animate-spin" style={{ color: 'var(--nt-text-faint)' }} />
                    </div>
                )}
            </div>

            {/* 状态行 */}
            {statusText.length > 0 && (
                <p className="px-6 pb-1 text-center nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>
                    {statusText}
                </p>
            )}

            {/* 动作 */}
            <div className="flex items-center justify-center gap-2 px-6 pb-6 pt-2">
                {canRetry && can.has('account-login') && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="rounded-full px-6 py-2 nt-t-item"
                        style={{ background: 'var(--nt-accent)', color: 'var(--nt-on-accent)' }}
                    >
                        重试
                    </button>
                )}
                {cooldown > 0 && (
                    <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>{cooldown} 秒后可重试</span>
                )}
                {login.failure && can.has('account-login-diagnostics') && (
                    <button
                        type="button"
                        onClick={onDiagnostics}
                        className="rounded-full px-3 py-2 nt-t-label"
                        style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                    >
                        复制诊断
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-3 py-2 nt-t-label"
                    style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                >
                    关闭
                </button>
            </div>
        </>
    );
};

/** 切平台确认卡。 */
const SwitchCard: React.FC<{
    fromLabel: string;
    toLabel: string;
    interactive: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ fromLabel, toLabel, interactive, onConfirm, onCancel }) => (
    <>
        <div className="px-6 pb-2 pt-6 text-center">
            <h2 className="nt-t-title" style={{ color: 'var(--nt-text)' }}>切换音乐平台</h2>
            <p className="mt-2 nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>
                从 <span style={{ color: 'var(--nt-text)' }}>{fromLabel}</span> 切到{' '}
                <span style={{ color: 'var(--nt-text)' }}>{toLabel}</span>？
            </p>
            <p className="mt-1 nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>正在播放与队列会被清空</p>
        </div>
        <div className="flex gap-2 px-6 pb-6 pt-3">
            <button
                type="button"
                onClick={onCancel}
                disabled={!interactive}
                className="flex-1 rounded-full py-3 nt-t-item"
                style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
            >
                取消
            </button>
            <button
                type="button"
                onClick={onConfirm}
                disabled={!interactive}
                className="flex flex-1 items-center justify-center gap-1 rounded-full py-3 nt-t-item"
                style={{ background: 'var(--nt-accent)', color: 'var(--nt-on-accent)' }}
            >
                <Check size={14} />切换
            </button>
        </div>
    </>
);

export default NeteaseAccount;